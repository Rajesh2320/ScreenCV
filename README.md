# ScreenCV - Standalone Resume Analyzer

AI-powered resume analysis platform for job candidates. Analyze your resume against any job description in under 2 minutes for ₹99.

**Status:** Development  
**Tech Stack:** Node.js + Vercel + Supabase + Claude Haiku + EmailJS  
**Architecture:** Standalone (separate Vercel, Supabase, GitHub)

---

## 📋 Project Setup (5 minutes)

### **1. Install Dependencies**

```bash
cd screencv
npm install
```

This installs all required packages listed in `package.json`.

---

### **2. Configure Environment Variables**

```bash
# Copy the template
cp .env.local_template .env.local

# Edit .env.local and fill in:
# - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# - ANTHROPIC_API_KEY
# - EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, etc.
```

**Where to get each value:**

| Variable | Where to find | How |
|----------|---------------|-----|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API | Copy "Project URL" |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | Copy "anon public" key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | Copy "service_role" key |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Generate new key |
| `EMAILJS_SERVICE_ID` | emailjs.com → Dashboard | Create Gmail service first |
| `EMAILJS_TEMPLATE_ID` | emailjs.com → Email Templates | Create test template |
| `EMAILJS_PUBLIC_KEY` | emailjs.com → Account → API Keys | Copy "Public Key" |
| `EMAILJS_PRIVATE_KEY` | emailjs.com → Account → API Keys | Copy "Private Key" |

---

### **3. Run Locally (Development)**

```bash
npm run dev
```

This starts Vercel Functions locally at `http://localhost:3000`.

Test endpoints:
```bash
curl -X POST http://localhost:3000/api/candidate/submit \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","resumeText":"..."}'
```

---

### **4. Deploy to Vercel**

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables in Vercel Dashboard
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add EMAILJS_SERVICE_ID
vercel env add EMAILJS_TEMPLATE_ID
vercel env add EMAILJS_PUBLIC_KEY
vercel env add EMAILJS_PRIVATE_KEY
```

Your project will be live at: `https://screencv.vercel.app` (or your custom domain)

---

## 📁 Project Structure

```
screencv/
├── api/candidate/              # API endpoints (Vercel Functions)
│   ├── submit.js               # POST: Capture form data
│   ├── create-payment.js        # POST: Create mock payment order
│   ├── payment-webhook.js       # POST: Simulate payment → analyze + PDF + email
│   └── extract-job-url.js       # POST: Extract job description from URL
│
├── lib/                         # Shared utilities
│   ├── constants.js             # Config, API keys, prices
│   ├── supabase-client.js       # Database helpers
│   ├── file-extraction.js       # Parse PDF/DOCX/TXT
│   ├── claude-scoring.js        # Claude Haiku integration
│   ├── pdf-generator.js         # Generate PDF reports
│   └── emailjs-sender.js        # Send emails
│
├── public/                      # Frontend pages
│   ├── index.html               # Landing page (TODO)
│   ├── screener.html            # Main tool (TODO)
│   ├── success.html             # Results page (TODO)
│   └── styles.css               # Styling (TODO)
│
├── .env.local                   # Environment variables (YOU fill in)
├── .gitignore                   # Git ignore rules
├── package.json                 # Dependencies
├── vercel.json                  # Vercel config
└── README.md                    # This file
```

---

## 🔌 API Endpoints

### **1. POST /api/candidate/submit**
Capture form submission (resume + job + email).

**Request:**
```json
{
  "email": "john@example.com",
  "candidateName": "John Doe",
  "resumeData": "base64-encoded-pdf-or-docx",
  "resumeFilename": "resume.pdf",
  "jobTitle": "Senior Backend Engineer",
  "jobDescription": "We are looking for...",
  "jobUrl": "https://linkedin.com/jobs/123456",
  "language": "English"
}
```

**Response:**
```json
{
  "success": true,
  "submissionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Submission received. Proceeding to payment..."
}
```

---

### **2. POST /api/candidate/create-payment**
Create mock payment order (₹99).

**Request:**
```json
{
  "email": "john@example.com",
  "submissionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "mock_order_1234567890",
  "amount": 9900,
  "currency": "INR"
}
```

---

### **3. POST /api/candidate/payment-webhook**
Simulate payment confirmation → Analyze resume → Generate PDF → Send email.

**Request:**
```json
{
  "orderId": "mock_order_1234567890",
  "paymentId": "mock_pay_1234567890",
  "status": "COMPLETED"
}
```

**Response:**
```json
{
  "success": true,
  "reviewId": "550e8400-e29b-41d4-a716-446655440001",
  "score": 82,
  "greenFlags": ["5+ years experience", "Node.js expert"],
  "redFlags": ["No ML experience"],
  "message": "Analysis complete. Check your email for the PDF report."
}
```

---

### **4. POST /api/candidate/extract-job-url**
Extract job description from URL.

**Request:**
```json
{
  "jobUrl": "https://linkedin.com/jobs/123456"
}
```

**Response:**
```json
{
  "success": true,
  "jobDescription": "We are looking for a senior backend engineer...",
  "jobTitle": "Senior Backend Engineer",
  "company": "Tech Corp Inc"
}
```

---

## 🔐 Environment Variables Required

| Variable | Type | Example |
|----------|------|---------|
| `SUPABASE_URL` | string | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | string | `eyJh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | string | `eyJh...` (SECRET) |
| `ANTHROPIC_API_KEY` | string | `sk-ant-...` (SECRET) |
| `EMAILJS_SERVICE_ID` | string | `service_xxxxx` |
| `EMAILJS_TEMPLATE_ID` | string | `template_xxxxx` |
| `EMAILJS_PUBLIC_KEY` | string | `xxxxx` |
| `EMAILJS_PRIVATE_KEY` | string | `xxxxx` (SECRET) |

---

## 💾 Database Schema

### **Tables Created:**
1. `candidate_submissions` - Form data before payment
2. `candidate_payments` - Payment records (mock for now)
3. `candidate_reviews` - Analysis results (after payment)
4. `candidate_reports` - Generated PDF reports
5. `candidate_sessions` - User analytics
6. `token_usage_logs` - Claude API cost tracking
7. `candidate_analytics` - Daily metrics

---

## 🚀 Development Workflow

**Stage 1:** Database ✅ COMPLETE  
**Stage 2:** API Endpoints (in progress)
- [ ] `/api/candidate/submit.js` - Create soon
- [ ] `/api/candidate/create-payment.js` - Create soon
- [ ] `/api/candidate/payment-webhook.js` - Create soon
- [ ] `/api/candidate/extract-job-url.js` - Create soon

**Stage 3:** Frontend Pages (after APIs)
- [ ] Landing page
- [ ] Resume screener tool
- [ ] Success page
- [ ] Styling

**Stage 4:** Admin Dashboard (after core features)  
**Stage 5:** Testing & Deployment  

---

## 🧪 Testing Locally

```bash
# Start dev server
npm run dev

# Test submit endpoint
curl -X POST http://localhost:3000/api/candidate/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "candidateName": "Test User",
    "resumeData": "base64-encoded-data",
    "resumeFilename": "resume.pdf",
    "jobTitle": "Engineer",
    "jobDescription": "Job details here"
  }'
```

---

## 📝 License

MIT License - Feel free to use and modify.

---

## 🤝 Support

For issues or questions, check:
1. Environment variables are set correctly (`.env.local`)
2. Supabase project has all 7 tables created
3. API keys are valid and have permissions
4. Check console logs for detailed errors
