import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CreateOrderOptions {
  amount: number; // in INR (will be converted to paise)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface VerifySignatureOptions {
  orderId: string;
  paymentId: string;
  signature: string;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  private get keyId(): string {
    return 'rzp_test_TY1CYZc1ze5tTF';
  }

  private get keySecret(): string {
    return 'cSYQ4QKZ7oC9HvqGDrg0rK0n';
  }

  private get webhookSecret(): string {
    return 'cSYQ4QKZ7oC9HvqGDrg0rK0n';
  }

  /**
   * Create a Razorpay Payment Order
   */
  async createOrder(options: CreateOrderOptions) {
    const amountInPaise = Math.round(options.amount * 100);
    const currency = options.currency || 'INR';

    this.logger.log(`Creating Razorpay Order for amount: ₹${options.amount} (${amountInPaise} paise), receipt: ${options.receipt}`);

    // Call Razorpay API to create official order
    if (this.keyId && this.keySecret) {
      try {
        const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
        const response = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency,
            receipt: options.receipt,
            notes: options.notes || {},
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          this.logger.error(`Razorpay API Error: ${errText}`);
          throw new BadRequestException(`Razorpay order creation failed: ${errText}`);
        }

        const data = await response.json();
        return {
          id: data.id,
          entity: data.entity,
          amount: data.amount,
          amount_paid: data.amount_paid,
          amount_due: data.amount_due,
          currency: data.currency,
          receipt: data.receipt,
          status: data.status,
          created_at: data.created_at,
          keyId: this.keyId,
        };
      } catch (err: any) {
        this.logger.error(`Razorpay API call failed: ${err.message}`);
        throw err;
      }
    }

    // Fallback Simulated Razorpay Order for testing/development
    const mockOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: mockOrderId,
      entity: 'order',
      amount: amountInPaise,
      amount_paid: 0,
      amount_due: amountInPaise,
      currency,
      receipt: options.receipt,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000),
      keyId: this.keyId,
      isSimulated: true,
    };
  }

  /**
   * Verify HMAC SHA256 signature sent by Razorpay Checkout
   */
  verifySignature(options: VerifySignatureOptions): boolean {
    const { orderId, paymentId, signature } = options;

    if (!orderId || !paymentId || !signature) {
      this.logger.warn(`Signature verification missing parameters: orderId=${orderId}, paymentId=${paymentId}`);
      return false;
    }

    // Check if it's a simulated order
    if (orderId.startsWith('order_') && paymentId.startsWith('pay_sim_')) {
      this.logger.log(`Simulated payment verified for order: ${orderId}`);
      return true;
    }

    try {
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(generatedSignature, 'utf-8'),
        Buffer.from(signature, 'utf-8')
      );

      this.logger.log(`Razorpay Signature Verification result for ${orderId}: ${isValid}`);
      return isValid;
    } catch (e: any) {
      this.logger.error(`Signature verification error: ${e.message}`);
      return false;
    }
  }

  /**
   * Verify Razorpay Webhook signature
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature || !rawBody) return false;

    try {
      const generatedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(generatedSignature, 'utf-8'),
        Buffer.from(signature, 'utf-8')
      );
    } catch (e: any) {
      this.logger.error(`Webhook signature verification error: ${e.message}`);
      return false;
    }
  }
}
