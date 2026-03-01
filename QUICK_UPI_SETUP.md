# 🚀 QUICK UPI PAYMENT SETUP (5 MINUTES)

## ✅ What's Ready

Your TCS store already has complete UPI payment infrastructure:
- ✅ Backend: Razorpay UPI integration
- ✅ Frontend: Mobile-to-app redirect 
- ✅ Database: Payment tracking
- ✅ Auto-order: After payment success
- ✅ invoices: Auto-generated PDFs

**Missing:** Real Razorpay API keys (currently placeholders)

---

## 🔑 STEP 1: GET FREE RAZORPAY KEYS (2 mins)

### 1.1 Sign Up
- Visit: https://dashboard.razorpay.com/signup
- Use email: `your_email@gmail.com`
- Verify email

### 1.2 Get API Keys
- Go to Settings → API Keys
- Click "Generate" 
- Copy the **TEST Key ID** and **TEST Key Secret**
  - Key ID starts with: `rzp_test_`
  - Key Secret: (keep it safe!)

---

## 🔧 STEP 2: UPDATE .ENV FILE

Edit `backend/.env`:

```bash
# Find these lines and update:
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID_HERE
RAZORPAY_KEY_SECRET=rzkp_test_YOUR_SECRET_HERE
```

**Example:**
```
RAZORPAY_KEY_ID=rzp_test_GH5sXpLwPqR6z
RAZORPAY_KEY_SECRET=rzkp_test_aBcDeF1234567890
```

---

## 🚀 STEP 3: RESTART SERVER (1 min)

```bash
# Kill existing processes
taskkill /IM node.exe /F

# Wait 2 seconds
timeout /t 2

# Restart backend
cd backend
npm run dev
```

---

## 📱 STEP 4: TEST UPI PAYMENT ON MOBILE

### On Android Phone:
1. Open: `http://[YOUR_PC_IP]:3000`
   - Get IP: Open `cmd` → type `ipconfig` → find IPv4 address
   - Example: `http://192.168.1.100:3000`

2. Register new account
3. Add product to cart
4. Click "Checkout"
5. Complete address form
6. Choose **"Pay with UPI"** → Click button
7. **UPI Payment Page opens** → Select Google Pay/PhonePe
8. **App opens automatically** → Payment initiated

### Payment Flow:
```
Click "Pay with UPI" 
    ↓
Razorpay processes
    ↓
Mobile detected
    ↓
Google Pay/PhonePe opens
    ↓
Complete payment
    ↓
Order auto-created
    ↓
Success page displayed
```

---

## 🎯 RAZORPAY TEST CREDENTIALS

If you need test credentials to try the flow:

### Test UPI IDs:
```
- Google Pay: testmob@okhdfcbank
- PhonePe: testphonepe@upi
- Any UPI App: test@upi
```

### Test Cards:
```
Visa: 4111 1111 1111 1111 (any CVV, any date)
```

---

## ✨ WHAT HAPPENS AFTER PAYMENT

### Automatic:
- ✅ Order created in database
- ✅ Cart cleared
- ✅ PDF invoice generated
- ✅ Success page shown
- ✅ SMS notification sent
- ✅ Stock reduced

### User Sees:
- "Order Successful" page
- Order number
- All product details
- Delivery address
- Download invoice button

---

## 🔗 IMPORTANT LINKS

| What | Link |
|------|------|
| Razorpay Dashboard | https://dashboard.razorpay.com |
| API Keys | https://dashboard.razorpay.com/app/settings/api-keys |
| Test Card Numbers | https://razorpay.com/docs/payments/payments/test-card-numbers/ |
| UPI Documentation | https://razorpay.com/docs/payments/upi/ |

---

## ❓ TROUBLESHOOTING

### Payment button not responding?
- Check if `.env` keys are still placeholders
- Rebuild frontend: `npm run build`
- Restart backend

### UPI app not opening on mobile?
- Check device has UPI app installed (Google Pay/PhonePe)
- Try on WiFi network
- Ensure backend is accessible from phone

### "Payment gateway loading" message?
- Wait 3-5 seconds for Razorpay script to load
- Check internet connection
- Verify Razorpay keys are valid

### Order not created after payment?
- Check backend logs for verification errors
- Verify shipping address is complete
- Ensure cart has items

---

## 🎉 READY!

Once Razorpay keys are added:
- Your store accepts real payments
- UPI payments work instantly
- Orders auto-create
- Business-ready ✅

---

**Need help? Check console logs (F12 → Console) for payment flow details** 🔍
