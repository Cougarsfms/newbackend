import { Controller, Post, Body, Get, Put, Param, Query, Delete, Req, Headers, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { AddAddressDto } from './dto/add-address.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RateProviderDto } from './dto/rate-provider.dto';

@ApiTags('Customer')
@Controller('customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) { }

    // ==================== AUTH ====================

    @Post('auth/register')
    @ApiOperation({ summary: 'Register customer' })
    async register(@Body() dto: RegisterCustomerDto) {
        return this.customerService.register(dto);
    }

    @Post('auth/login')
    @ApiOperation({ summary: 'Login with OTP' })
    async login(@Body() body: { phoneNumber: string; otp: string }) {
        return this.customerService.verifyOtp(body.phoneNumber, body.otp);
    }

    @Post('auth/fcm-token')
    @ApiOperation({ summary: 'Update FCM token for customer' })
    async updateFcmToken(@Body() body: { phoneNumber: string; fcmToken: string }) {
        return this.customerService.updateFcmToken(body.phoneNumber, body.fcmToken);
    }

    // ==================== PROFILE ====================

    @Get(':id/profile')
    @ApiOperation({ summary: 'Get profile' })
    async getProfile(@Param('id') id: string) {
        return this.customerService.getProfile(id);
    }

    @Put(':id/profile')
    @ApiOperation({ summary: 'Update profile' })
    async updateProfile(@Param('id') id: string, @Body() dto: UpdateCustomerProfileDto) {
        return this.customerService.updateProfile(id, dto);
    }

    @Post(':id/addresses')
    @ApiOperation({ summary: 'Add address' })
    async addAddress(@Param('id') id: string, @Body() dto: AddAddressDto) {
        return this.customerService.addAddress(id, dto);
    }

    @Get(':id/addresses')
    @ApiOperation({ summary: 'List addresses' })
    async getAddresses(@Param('id') id: string) {
        return this.customerService.getAddresses(id);
    }

    @Put(':id/addresses/:addressId')
    @ApiOperation({ summary: 'Update address' })
    async updateAddress(@Param('id') id: string, @Param('addressId') addressId: string, @Body() dto: AddAddressDto) {
        return this.customerService.updateAddress(id, addressId, dto);
    }

    @Delete(':id/addresses/:addressId')
    @ApiOperation({ summary: 'Delete address' })
    async deleteAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
        return this.customerService.deleteAddress(id, addressId);
    }

    @Delete(':id/account')
    @ApiOperation({ summary: 'Deactivate account' })
    async deactivateAccount(@Param('id') id: string) {
        return this.customerService.deactivateAccount(id);
    }

    // ==================== SERVICE DISCOVERY ====================

    @Get('services/categories')
    @ApiOperation({ summary: 'List service categories' })
    async getCategories(@Query('city') city?: string) {
        return this.customerService.getCategories(city);
    }

    @Get('services/nearby')
    @ApiOperation({ summary: 'Find nearby providers' })
    async getNearbyProviders(@Query('lat') lat: number, @Query('long') long: number) {
        return this.customerService.getNearbyProviders(lat, long);
    }

    @Get('services/:id/estimate')
    @ApiOperation({ summary: 'Get pricing estimate' })
    async getEstimate(@Param('id') id: string) {
        return this.customerService.getEstimate(id);
    }

    // ==================== BOOKINGS ====================

    @Post(':id/bookings')
    @ApiOperation({ summary: 'Create booking' })
    async createBooking(@Param('id') id: string, @Body() dto: CreateBookingDto) {
        return this.customerService.createBooking(id, dto);
    }

    @Get(':id/bookings')
    @ApiOperation({ summary: 'List bookings' })
    async getBookings(@Param('id') id: string) {
        return this.customerService.getBookings(id);
    }

    @Get(':id/bookings/:bookingId')
    @ApiOperation({ summary: 'Get booking details' })
    async getBookingDetails(@Param('id') id: string, @Param('bookingId') bookingId: string) {
        return this.customerService.getBookingDetails(id, bookingId);
    }

    @Post(':id/bookings/:bookingId/cancel')
    @ApiOperation({ summary: 'Cancel booking' })
    async cancelBooking(@Param('id') id: string, @Param('bookingId') bookingId: string) {
        return this.customerService.cancelBooking(id, bookingId);
    }

    // ==================== TRACKING ====================

    @Get(':id/bookings/:bookingId/tracking')
    @ApiOperation({ summary: 'Get provider location' })
    async getTracking(@Param('id') id: string, @Param('bookingId') bookingId: string) {
        return this.customerService.getTracking(id, bookingId);
    }

    // ==================== PAYMENTS (RAZORPAY) ====================

    @Post(':id/payments/create-order')
    @ApiOperation({ summary: 'Calculate authoritative price breakdown and create Razorpay payment order' })
    async createPaymentOrder(@Param('id') id: string, @Body() dto: CreatePaymentOrderDto) {
        return this.customerService.createPaymentOrder(id, dto);
    }

    @Post(':id/payments/verify')
    @ApiOperation({ summary: 'Verify Razorpay payment signature and confirm booking' })
    async verifyPayment(@Param('id') id: string, @Body() dto: VerifyPaymentDto) {
        return this.customerService.verifyPayment(id, dto);
    }

    @Get('payments/checkout-page')
    @ApiOperation({ summary: 'Render Razorpay Web Checkout Page' })
    async renderCheckoutPage(
        @Query('orderId') orderId: string,
        @Query('amount') amount: string,
        @Query('keyId') keyId: string,
        @Query('bookingId') bookingId: string,
        @Query('customerId') customerId: string,
        @Res() res: any
    ) {
        const key = keyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_TY1CYZc1ze5tTF';
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Razorpay Checkout - Gyros Quick Services</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0F172A; color: #FFFFFF; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1E293B; padding: 28px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; max-width: 380px; width: 100%; border: 1px solid #334155; }
    .logo { font-size: 24px; font-weight: 800; color: #FF7000; letter-spacing: -0.5px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #94A3B8; margin-bottom: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .amount-box { background: #0F172A; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #334155; }
    .amount-label { font-size: 13px; color: #94A3B8; margin-bottom: 4px; }
    .amount-val { font-size: 28px; font-weight: 800; color: #10B981; }
    .btn { background: linear-gradient(135deg, #FF7000 0%, #FF5500 100%); color: white; border: none; padding: 16px 24px; border-radius: 14px; font-weight: 800; font-size: 16px; cursor: pointer; width: 100%; box-shadow: 0 4px 14px rgba(255,112,0,0.4); }
    .btn:active { transform: scale(0.98); }
    .footer { font-size: 11px; color: #64748B; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ Gyros Quick Services</div>
    <div class="subtitle">Razorpay Secure Checkout</div>
    <div class="amount-box">
      <div class="amount-label">Payable Amount</div>
      <div class="amount-val">₹${amount}</div>
    </div>
    <p style="font-size:13px; color:#CBD5E1; margin-bottom:20px;">Click below to open UPI (GPay, PhonePe, Paytm), Card or Netbanking</p>
    <button id="rzp-button" class="btn">Pay ₹${amount} Now</button>
    <div class="footer">🔒 256-bit SSL Encrypted • Powered by Razorpay</div>
  </div>
  <script>
    var options = {
      "key": "${key}",
      "amount": "${Math.round(Number(amount) * 100)}",
      "currency": "INR",
      "name": "Gyros Quick Services",
      "description": "Service Booking Payment",
      "image": "https://i.imgur.com/3g7nmjc.png",
      "order_id": "${orderId}",
      "handler": function (response){
        document.body.innerHTML = '<div class="card"><div class="logo">🎉 Payment Verified!</div><p>Confirming your booking...</p></div>';
        fetch('/api/customer/${customerId}/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
            bookingId: "${bookingId}"
          })
        }).then(r => r.json()).then(data => {
          if (data.success || data.data?.paymentStatus === 'SUCCESS') {
            document.body.innerHTML = '<div class="card"><div class="logo">✅ Booking Confirmed!</div><p>You can return to the Gyros App.</p></div>';
            setTimeout(function() { window.location.href = "com.Gyors.customerapp://payment-success?bookingId=${bookingId}"; }, 1500);
          } else {
            alert("Payment verification failed. Please contact support.");
          }
        }).catch(err => {
          alert("Verification error: " + err.message);
        });
      },
      "modal": {
        "ondismiss": function() {
          console.log('Checkout dismissed');
        }
      },
      "theme": { "color": "#FF7000" }
    };
    var rzp1 = new Razorpay(options);
    document.getElementById('rzp-button').onclick = function(e){
      rzp1.open();
      e.preventDefault();
    }
    window.onload = function() {
      setTimeout(function() { rzp1.open(); }, 500);
    }
  </script>
</body>
</html>
        `;
        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
    }

    @Post('payments/webhook')
    @ApiOperation({ summary: 'Razorpay Payment Webhook listener' })
    async razorpayWebhook(
        @Body() body: any,
        @Headers('x-razorpay-signature') signature: string,
        @Req() req: any
    ) {
        const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(body);
        return this.customerService.handleRazorpayWebhook(rawBody, signature);
    }

    @Post(':id/payments/initiate')
    @ApiOperation({ summary: 'Initiate payment' })
    async initiatePayment(@Param('id') id: string, @Body() dto: InitiatePaymentDto) {
        return this.customerService.initiatePayment(id, dto);
    }

    @Get(':id/payments/history')
    @ApiOperation({ summary: 'Get payment history' })
    async getPaymentHistory(@Param('id') id: string) {
        return this.customerService.getPaymentHistory(id);
    }

    // ==================== COUPONS & PACKAGES ====================

    @Get(':id/available-coupons')
    @ApiOperation({ summary: 'Get available coupons for home screen' })
    async getAvailableCoupons(@Param('id') id: string) {
        return this.customerService.getAvailableCoupons(id);
    }

    @Post(':id/purchase-coupon/:couponId')
    @ApiOperation({ summary: 'Purchase/Redeem a coupon package' })
    async purchaseCoupon(@Param('id') id: string, @Param('couponId') couponId: string) {
        return this.customerService.purchaseCoupon(id, couponId);
    }

    @Get(':id/purchased-coupons')
    @ApiOperation({ summary: 'List coupons already purchased by customer' })
    async getPurchasedCoupons(@Param('id') id: string) {
        return this.customerService.getPurchasedCoupons(id);
    }

    // ==================== RATINGS & SUPPORT ====================

    @Post(':id/ratings')
    @ApiOperation({ summary: 'Rate provider' })
    async rateProvider(@Param('id') id: string, @Body() dto: RateProviderDto) {
        return this.customerService.rateProvider(id, dto);
    }

    @Post(':id/support')
    @ApiOperation({ summary: 'Raise support ticket' })
    async raiseTicket(@Param('id') id: string, @Body() body: { bookingId: string; message: string }) {
        return this.customerService.raiseTicket(id, body.bookingId, body.message);
    }

    @Get(':id/referral/stats')
    @ApiOperation({ summary: 'Get referral stats and earnings' })
    async getReferralStats(@Param('id') id: string) {
        return this.customerService.getReferralStats(id);
    }
}

