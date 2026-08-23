import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { ServicesService } from '../services/services.service';
import { CustomerService } from '../customer/customer.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ConciergeService {
  private readonly logger = new Logger(ConciergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly servicesService: ServicesService,
    private readonly customerService: CustomerService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Main entry point for customer chat
   */
  async processMessage(
    customerId: string,
    message: string,
    sessionId?: string,
    confirmAction?: { type: 'create_booking' | 'cancel_booking'; details: any },
  ) {
    // 1. Resolve customer context
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    // 2. Resolve or create session
    let session = sessionId
      ? await this.prisma.conciergeSession.findUnique({ where: { id: sessionId } })
      : null;

    if (!session) {
      session = await this.prisma.conciergeSession.create({
        data: { customerId },
      });
    }

    const currentSessionId = session.id;

    // Log the user message input
    await this.prisma.conciergeMessage.create({
      data: {
        sessionId: currentSessionId,
        sender: 'USER',
        text: message,
      },
    });

    await this.logAudit(currentSessionId, 'USER_INPUT', { message, confirmAction });

    let systemContextUpdate = '';
    let executionReply = '';

    // 3. Handle confirmation actions from the frontend (High-risk action execution after approval)
    if (confirmAction) {
      try {
        const executionResult = await this.executeAction(customerId, customer.user.id, confirmAction);
        systemContextUpdate = `[System Update]: Action "${confirmAction.type}" executed successfully. Result details: ${JSON.stringify(executionResult)}. Please formulate a confirmation response to the customer.`;
        
        if (confirmAction.type === 'create_booking') {
          executionReply = `Successfully created your booking for "${(executionResult as any).service?.name || 'requested service'}" scheduled on ${new Date((executionResult as any).date).toLocaleDateString()} at ${new Date((executionResult as any).date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Your booking ID is ${(executionResult as any).id}.`;
        } else {
          executionReply = `Successfully cancelled booking ID ${confirmAction.details.bookingId}.`;
        }

        await this.logAudit(currentSessionId, 'EXECUTION', {
          action: confirmAction.type,
          status: 'SUCCESS',
          result: executionResult,
        });
      } catch (err: any) {
        this.logger.error(`Failed to execute approved action ${confirmAction.type}:`, err);
        systemContextUpdate = `[System Update]: Action "${confirmAction.type}" execution failed. Error: ${err.message}. Please inform the user of this failure and check.`;
        
        executionReply = `I apologize, but we could not complete the requested ${confirmAction.type === 'create_booking' ? 'booking' : 'cancellation'}. Error: ${err.message || 'Unknown error'}.`;

        await this.logAudit(currentSessionId, 'EXECUTION', {
          action: confirmAction.type,
          status: 'FAILED',
          error: err.message,
        });
      }
    }

    // 4. Try LLM (Gemini) Flow
    const apiKey = process.env.GEMINI_API_KEY;
    const isApiKeyConfigured = apiKey && apiKey !== 'your_gemini_api_key_here';

    if (isApiKeyConfigured) {
      try {
        const result = await this.runGeminiFlow(customerId, currentSessionId, customer, message, systemContextUpdate);
        return {
          success: true,
          sessionId: currentSessionId,
          ...result,
        };
      } catch (err: any) {
        this.logger.error('Gemini API call failed, falling back to deterministic workflow:', err);
        await this.logAudit(currentSessionId, 'TOOL_CALL', { note: 'Gemini failed. Triggering deterministic fallback.' });
      }
    }

    // If Gemini is unconfigured or failed, and we just executed a confirmation, return direct reply
    if (confirmAction && executionReply) {
      await this.prisma.conciergeMessage.create({
        data: {
          sessionId: currentSessionId,
          sender: 'AI',
          text: executionReply,
        },
      });

      await this.logAudit(currentSessionId, 'TOOL_RESPONSE', {
        note: 'Execution confirmation response generated directly.',
        response: { reply: executionReply },
      });

      return {
        success: true,
        sessionId: currentSessionId,
        reply: executionReply,
      };
    }

    // 5. Fallback Workflow: Deterministic Rule-Based Assistant & Escalation
    const fallbackResult = await this.runDeterministicFallback(customerId, message);
    
    // Save AI response message
    await this.prisma.conciergeMessage.create({
      data: {
        sessionId: currentSessionId,
        sender: 'AI',
        text: fallbackResult.reply,
      },
    });

    await this.logAudit(currentSessionId, 'TOOL_RESPONSE', {
      note: 'Deterministic fallback response generated.',
      response: fallbackResult,
    });

    return {
      success: true,
      sessionId: currentSessionId,
      reply: fallbackResult.reply,
      proposal: fallbackResult.proposal,
      services: fallbackResult.services,
      bookings: fallbackResult.bookings,
    };
  }

  /**
   * Fetch session chat history
   */
  async getSessionHistory(customerId: string) {
    const session = await this.prisma.conciergeSession.findFirst({
      where: { customerId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return {
        sessionId: null,
        messages: [],
      };
    }

    return {
      sessionId: session.id,
      messages: session.messages.map(m => ({
        id: m.id,
        sender: m.sender.toLowerCase(),
        text: m.text,
        timestamp: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Log an audit trail entry
   */
  private async logAudit(sessionId: string, actionType: string, details: any) {
    try {
      await this.prisma.conciergeAuditLog.create({
        data: {
          sessionId,
          actionType,
          details: JSON.stringify(details),
        },
      });
    } catch (e) {
      this.logger.error('Failed to write audit log:', e);
    }
  }

  /**
   * Execute actual DB write operations (User Approved)
   */
  private async executeAction(customerId: string, userId: string, confirmAction: { type: string; details: any }) {
    if (confirmAction.type === 'create_booking') {
      const { serviceId, date, addressId, durationMinutes } = confirmAction.details;
      if (!serviceId || !date || !addressId) {
        throw new BadRequestException('Missing fields for booking confirmation');
      }

      // We call the main BookingsService to create a standard Booking
      return this.bookingsService.createBooking({
        userId,
        serviceId,
        date: new Date(date),
        addressId,
        bookingType: 'Scheduled',
        durationMinutes: durationMinutes ? Number(durationMinutes) : 60,
      });
    }

    if (confirmAction.type === 'cancel_booking') {
      const { bookingId, reason } = confirmAction.details;
      if (!bookingId) {
        throw new BadRequestException('Booking ID required for cancellation');
      }

      return this.bookingsService.cancelBooking(bookingId, reason || 'Cancelled via AI Concierge');
    }

    throw new BadRequestException(`Unknown confirm action type: ${confirmAction.type}`);
  }

  /**
   * Run Gemini function-calling conversational loop
   */
  private async runGeminiFlow(
    customerId: string,
    sessionId: string,
    customer: any,
    userMessage: string,
    systemContextUpdate?: string,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Get previous session messages
    const chatHistory = await this.prisma.conciergeMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20, // keep the context window reasonable
    });

    // Resolve domain context (available services, user bookings, addresses) for instruction injection
    const [services, bookings, addresses] = await Promise.all([
      this.servicesService.findAllItems(),
      this.bookingsService.getUserBookings(customer.user.id),
      this.customerService.getAddresses(customerId),
    ]);

    const serviceSummary = services.map(s => `ID: ${s.id}, Name: ${s.name}, Price: ₹${s.price}, Desc: ${s.description}`).join('; ');
    const bookingSummary = bookings.map(b => `ID: ${b.id}, Service: ${b.service?.name}, Date: ${b.date}, Status: ${b.status}`).join('; ');
    const addressSummary = addresses.map(a => `ID: ${a.id}, Label: ${a.label}, Address: ${a.address}, City: ${a.city}`).join('; ');

    const systemInstruction = `You are the Booking Agent (AI-003) for our Quick Service Application, orchestrating availability, pricing, booking, and payment. Your job is to assist the customer with natural-language service discovery and their booking journey. Keep responses polite, structured, and helpful.

Authorized User Context:
- Customer Name: ${customer.name}
- Customer Phone: ${customer.phoneNumber}
- Saved Addresses: [${addressSummary}]
- Current Bookings: [${bookingSummary}]
- Available Services: [${serviceSummary}]

Strict Operational Rules (AI-003 Specification):
1. Objective: Assist users with slot availability lookup, service pricing checks, package coupon selections, and booking options.
2. Tools: ONLY use the registered and permitted tools. Do not simulate or invent tools.
3. Outputs: Produce natural language answers, recommendations, and clear action proposals.
4. Approvals: High-risk database actions (like writing a new booking or cancelling a booking) REQUIRE explicit user approval. You must call \`propose_booking\` or \`propose_cancellation\` to generate a proposal payload which the frontend renders as a confirmation card. The user must explicitly approve/confirm it on the UI before the write is executed.
5. Pricing and Availability Rules:
   - Pricing is based on the service item's base rate.
   - Customers can apply Coupon Codes to get percentage discounts (up to the max discount limit).
   - Customers with pre-purchased package coupons can redeem them for booking without additional cost.
6. Fallback: If AI connection/tool generation fails, a deterministic fallback workflow handles direct listing queries and escalates complaints to human support.
7. Audit: Every tool invocation, parameter, and decision is logged to the \`ConciergeAuditLog\` database table.`;

    // Map history to Gemini API format
    const contents: any[] = [];
    for (const msg of chatHistory) {
      contents.push({
        role: msg.sender === 'USER' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      });
    }

    // Append system update if any (e.g. execution result)
    if (systemContextUpdate) {
      contents.push({
        role: 'user',
        parts: [{ text: systemContextUpdate }],
      });
    }

    const payload = {
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'list_services',
              description: 'Retrieve all available service categories and service items.',
            },
            {
              name: 'get_my_bookings',
              description: "Retrieve the customer's list of current and past bookings.",
            },
            {
              name: 'get_booking_details',
              description: 'Get detailed information about a specific booking.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  bookingId: { type: 'STRING', description: 'The unique ID of the booking.' },
                },
                required: ['bookingId'],
              },
            },
            {
              name: 'get_addresses',
              description: "Get the customer's saved address profiles.",
            },
            {
              name: 'add_address',
              description: 'Add a new address profile for the customer.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  label: { type: 'STRING', description: 'Label for address (e.g. Home, Work, Gym).' },
                  address: { type: 'STRING', description: 'Street address line.' },
                  city: { type: 'STRING', description: 'City name.' },
                  state: { type: 'STRING', description: 'State name.' },
                  zipcode: { type: 'STRING', description: 'Postal pincode.' },
                },
                required: ['label', 'address', 'city', 'state', 'zipcode'],
              },
            },
            {
              name: 'propose_booking',
              description: 'Prepare a booking proposal for the customer to confirm. This does NOT execute the booking directly.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  serviceId: { type: 'STRING', description: 'The ID of the service item to book.' },
                  date: { type: 'STRING', description: 'The scheduled ISO date-time string.' },
                  addressId: { type: 'STRING', description: 'The customer address ID.' },
                  durationMinutes: { type: 'NUMBER', description: 'Duration of booking in minutes (default 60).' },
                },
                required: ['serviceId', 'date', 'addressId'],
              },
            },
            {
              name: 'propose_cancellation',
              description: 'Prepare a cancellation proposal for an existing booking. This does NOT cancel immediately.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  bookingId: { type: 'STRING', description: 'The ID of the booking to cancel.' },
                  reason: { type: 'STRING', description: 'Reason for cancellation.' },
                },
                required: ['bookingId', 'reason'],
              },
            },
            {
              name: 'raise_support_ticket',
              description: 'Escalate the conversation to a human support agent by raising a ticket.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  bookingId: { type: 'STRING', description: 'Optional booking ID linked to the issue.' },
                  message: { type: 'STRING', description: 'Description of the complaint or issue.' },
                },
                required: ['message'],
              },
            },
          ],
        },
      ],
    };

    // Call Gemini API and handle tool execution loops
    let replyText = '';
    let proposal: any = null;
    let servicesList: any[] = [];
    let bookingsList: any[] = [];

    let currentResponse = await this.callGemini(url, payload);
    let candidate = currentResponse?.candidates?.[0];
    let parts = candidate?.content?.parts || [];

    // Loop to handle function calls
    let loopCount = 0;
    while (parts.some((p: any) => p.functionCall) && loopCount < 5) {
      loopCount++;
      const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
      
      const toolOutputs: any[] = [];

      for (const fc of functionCalls) {
        const { name, args } = fc;
        await this.logAudit(sessionId, 'TOOL_CALL', { tool: name, arguments: args });

        let resultData: any;
        try {
          switch (name) {
            case 'list_services':
              resultData = await this.servicesService.findAllCategories();
              servicesList = resultData;
              break;
            case 'get_my_bookings':
              resultData = await this.bookingsService.getUserBookings(customer.user.id);
              bookingsList = resultData;
              break;
            case 'get_booking_details':
              resultData = await this.bookingsService.getBookingDetails(args.bookingId);
              break;
            case 'get_addresses':
              resultData = await this.customerService.getAddresses(customerId);
              break;
            case 'add_address':
              resultData = await this.customerService.addAddress(customerId, {
                label: args.label,
                address: args.address,
                city: args.city,
                state: args.state,
                country: 'India',
                zipcode: args.zipcode,
                latitude: 28.55, // default
                longitude: 77.20, // default
              });
              break;
            case 'propose_booking':
              // Fetch service details for proposal display
              const service = await this.prisma.serviceItem.findUnique({ where: { id: args.serviceId } });
              proposal = {
                type: 'create_booking',
                details: {
                  serviceId: args.serviceId,
                  serviceName: service?.name || 'Quick Service',
                  price: service?.price || 499,
                  date: args.date,
                  addressId: args.addressId,
                  durationMinutes: args.durationMinutes || 60,
                },
              };
              resultData = { status: 'PROPOSAL_GENERATED', proposal };
              break;
            case 'propose_cancellation':
              const booking = await this.bookingsService.getBookingDetails(args.bookingId);
              proposal = {
                type: 'cancel_booking',
                details: {
                  bookingId: args.bookingId,
                  serviceName: (booking as any).service?.name || 'Booking',
                  date: (booking as any).date,
                  reason: args.reason,
                },
              };
              resultData = { status: 'PROPOSAL_GENERATED', proposal };
              break;
            case 'raise_support_ticket':
              resultData = await this.prisma.supportTicket.create({
                data: {
                  customer_id: customerId,
                  customerbooking_id: args.bookingId || '',
                  status: 'PENDING',
                },
              });
              await this.prisma.escalation.create({
                data: {
                  provider_id: '', // general support
                  title: 'Concierge Escalation',
                  description: args.message,
                  status: 'OPEN',
                  priority: 'MEDIUM',
                },
              });
              resultData = { status: 'SUPPORT_TICKET_RAISED', ticketId: resultData.id };
              break;
            default:
              resultData = { error: 'Unknown tool declaration' };
          }
        } catch (e: any) {
          resultData = { error: e.message };
        }

        await this.logAudit(sessionId, 'TOOL_RESPONSE', { tool: name, response: resultData });

        toolOutputs.push({
          functionResponse: {
            name,
            response: { result: resultData },
          },
        });
      }

      // Add model's choice and the tools output back to context
      contents.push(candidate.content);
      contents.push({
        role: 'user',
        parts: toolOutputs,
      });

      // Call Gemini again
      currentResponse = await this.callGemini(url, {
        contents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
      });
      candidate = currentResponse?.candidates?.[0];
      parts = candidate?.content?.parts || [];
    }

    replyText = parts.map((p: any) => p.text || '').join('\n');

    // Save final response message
    await this.prisma.conciergeMessage.create({
      data: {
        sessionId,
        sender: 'AI',
        text: replyText,
      },
    });

    await this.logAudit(sessionId, 'LLM_DECISION', { replyText, proposal });

    return {
      reply: replyText,
      proposal,
      services: servicesList,
      bookings: bookingsList,
    };
  }

  /**
   * Perform direct fetch call to Gemini
   */
  private async callGemini(url: string, payload: any) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (Status ${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Deterministic rule-based assistant + escalation when Gemini is unconfigured or fails
   */
  private async runDeterministicFallback(customerId: string, message: string): Promise<{
    reply: string;
    proposal?: any;
    services?: any[];
    bookings?: any[];
  }> {
    const text = message.toLowerCase();

    // Support / Escalation keyword match
    if (text.includes('help') || text.includes('support') || text.includes('complain') || text.includes('issue') || text.includes('fail') || text.includes('representative')) {
      try {
        const ticket = await this.prisma.supportTicket.create({
          data: {
            customer_id: customerId,
            customerbooking_id: '',
            status: 'PENDING',
          },
        });
        await this.prisma.escalation.create({
          data: {
            provider_id: '',
            title: 'Concierge Escalation (Fallback)',
            description: `Fallback ticket raised from user message: "${message}"`,
            status: 'OPEN',
            priority: 'MEDIUM',
          },
        });
        return {
          reply: `I have raised a support ticket (ID: ${ticket.id}) and escalated this to our support team. A representative will reach out to you shortly.`,
        };
      } catch (e: any) {
        return {
          reply: 'I apologize, but I am having trouble connecting to support. Please try calling customer care or raising a ticket in the Support screen.',
        };
      }
    }

    // Book prefix check (e.g. from service card "Select" button or typed)
    if (text.startsWith('book ')) {
      const serviceNameInput = message.substring(5).trim();
      const service = await this.prisma.serviceItem.findFirst({
        where: {
          name: {
            contains: serviceNameInput,
            mode: 'insensitive',
          },
        },
      });

      if (service) {
        const addresses = await this.customerService.getAddresses(customerId);
        if (addresses.length > 0) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);

          const proposal = {
            type: 'create_booking',
            details: {
              serviceId: service.id,
              serviceName: service.name,
              price: Number(service.price),
              date: tomorrow.toISOString(),
              addressId: addresses[0].id,
              durationMinutes: 60,
            },
          };

          return {
            reply: `I have prepared a booking proposal for "${service.name}" scheduled for ${tomorrow.toLocaleDateString()} at 10:00 AM. Please approve the card below to finalize your booking.`,
            proposal,
          };
        } else {
          return {
            reply: `I found the service "${service.name}", but you don't have any saved addresses. Please add an address first.`,
          };
        }
      }
    }

    // List Services check
    if (text.includes('service') || text.includes('clean') || text.includes('repair') || text.includes('plumb') || text.includes('ac')) {
      const categories = await this.servicesService.findAllCategories();
      const services = await this.servicesService.findAllItems();

      // Return a proposal or direct service list
      return {
        reply: 'Here are the cleaning and repair services available in your area. Select a service to schedule a visit.',
        services,
      };
    }

    // Bookings check
    if (text.includes('booking') || text.includes('schedule') || text.includes('appointment')) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (customer) {
        const bookings = await this.bookingsService.getUserBookings(customer.user_id);
        if (bookings.length > 0) {
          const list = bookings.map(b => `- Booking #${b.id.split('-')[0]}: ${(b as any).service?.name} on ${new Date(b.date).toLocaleDateString()} (${b.status})`).join('\n');
          return {
            reply: `Here are your current bookings:\n${list}\n\nWhat would you like to do?`,
            bookings,
          };
        }
      }
      return {
        reply: 'You do not have any active bookings at the moment. Would you like to check our available services?',
      };
    }

    // Address check
    if (text.includes('address') || text.includes('location')) {
      const addresses = await this.customerService.getAddresses(customerId);
      if (addresses.length > 0) {
        const list = addresses.map(a => `- ${a.label}: ${a.address}, ${a.city}`).join('\n');
        return {
          reply: `Here are your saved addresses:\n${list}`,
        };
      }
      return {
        reply: 'You do not have any saved addresses. You can add one by telling me details like: "Add address Home at 123 Green Street, Delhi 110016".',
      };
    }

    // Default responder
    return {
      reply: `Hello! I'm your Customer Concierge. I can help you:
1. Discover services (e.g. "What services are available?")
2. Check bookings (e.g. "Show my current bookings")
3. Guide booking setup or cancellation.
4. Raise a support ticket for immediate help.

How can I help you today?`,
    };
  }
}
