# MERN Travel Management System

A full-stack MERN CRM system built for **Dream Ceylon Journeys**, a Sri Lankan Destination Management Company (DMC).  
This CRM helps manage destinations, tour packages, customer inquiries, bookings, vehicle pricing, AI client replies, AI itinerary generation, professional itinerary PDFs, quotation PDFs, and public website data APIs.

---

## Project Overview

**Dream Ceylon CRM** is designed as a real-world travel business management system.  
The main goal of this project is to help a Sri Lankan DMC manage client inquiries, create customized tours, track bookings, manage vehicles, and generate professional client documents.

This project was built as a portfolio-level full-stack application using the MERN stack.

---

## Business Use Case

Dream Ceylon Journeys receives client inquiries through:

- Website
- Facebook
- Instagram
- WhatsApp
- Referrals
- Other travel channels

The CRM allows the admin team to:

- Store and manage destinations
- Create tour packages
- Manage client inquiries
- Convert inquiries into bookings
- Manage vehicle pricing
- Generate AI-assisted client replies
- Generate AI-assisted Sri Lanka itineraries
- Export professional itinerary PDFs
- Export quotation PDFs
- Provide public API data for a future website

---

## Tech Stack

### Frontend

- React
- Vite
- Bootstrap
- React Router DOM
- Axios
- React Icons
- CSS

### Backend

- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- JWT Authentication
- bcryptjs
- CORS
- dotenv
- OpenAI API
- pdf-lib

### Database

- MongoDB Atlas

### Tools Used

- IntelliJ IDEA Ultimate
- Postman
- Git
- GitHub
- MongoDB Atlas
- OpenAI Platform

---

## Main Features

### Admin Authentication

- Admin registration
- Admin login
- JWT token authentication
- Protected admin routes
- Admin profile endpoint
- Secure password hashing with bcrypt

### Dashboard

- Total destinations
- Total packages
- Total vehicles
- Total inquiries
- Total bookings
- Revenue statistics
- Monthly booking statistics
- Recent inquiries
- Recent bookings

### Destination Management

- Add destinations
- View destinations
- Edit destinations
- Delete destinations
- Search destinations
- Filter by category
- Filter by status
- Mark destinations as popular
- Public destination API support

### Tour Package Management

- Add tour packages
- View packages
- Edit packages
- Delete packages
- Add package itinerary
- Add inclusions
- Add exclusions
- Select related destinations
- Mark packages as featured
- Public package API support

### Inquiry Management

- Add client inquiries
- View inquiries
- Edit inquiry status
- Delete inquiries
- Search inquiries
- Filter by source
- Filter by status
- Filter by priority
- Link inquiry with interested package

### Booking Management

- Create bookings
- Convert inquiries into bookings
- Manage customer details
- Select package
- Add travel dates
- Select vehicle type
- Add total price
- Add advance payment
- Track payment status
- Track booking status
- Calculate balance amount

### Vehicle Management

- Add vehicles
- View vehicles
- Edit vehicles
- Delete vehicles
- Add daily price
- Add capacity
- Add features
- Add vehicle image
- Mark vehicles as featured
- Public vehicle API support

### Client Tools

- World time checker
- Quick reply templates
- Google Translate helper
- WhatsApp reply helper
- Copy reply button
- Open WhatsApp Web with prepared message

### AI Client Reply Generator

- Generate professional client replies
- Supports WhatsApp, Email, and Facebook messages
- Tone selection
- Language selection
- Uses OpenAI API
- Helps respond faster to international clients

### AI Itinerary Generator

- Generate Sri Lanka day-by-day itineraries
- Uses client name, country, interests, duration, budget, vehicle type, arrival point, and destination preferences
- Creates professional travel plans for real clients
- Avoids unrealistic travel routes
- Supports customized Sri Lanka private tours

### Professional Itinerary PDF Generator

- Generates client-ready itinerary PDFs
- Uses Dream Ceylon Journeys logo
- Adds client summary
- Adds trip summary
- Adds selected vehicle
- Adds day-by-day itinerary
- Adds important notes
- Adds contact details
- Adds clickable website and WhatsApp links
- Adds watermark
- Uses `pdf-lib`

### Public Website API

Public routes are available for a future Next.js or React public website.

Public APIs return only active data:

- Popular destinations
- Featured tour packages
- Featured vehicles
- Destination listing
- Package listing
- Vehicle listing

### Quotation PDF Generator

- Generates professional quotation PDFs
- Includes client details
- Tour summary
- Cost breakdown
- Vehicle cost calculation
- Hotel cost optional
- Activities cost optional
- Entrance fees optional
- Discount
- Advance payment
- Balance payment
- Inclusions
- Exclusions
- Payment terms
- Contact details
- Clickable website and social links

---

## Project Folder Structure

```text
dream-ceylon-crm
├── backend
│   ├── assets
│   │   ├── brand
│   │   │   └── logo.png
│   │   └── vehicles
│   │       ├── car.png
│   │       ├── suv.png
│   │       ├── van.png
│   │       ├── mini-bus.png
│   │       └── default-vehicle.png
│   ├── config
│   │   ├── db.js
│   │   └── brandConfig.js
│   ├── controllers
│   │   ├── authController.js
│   │   ├── destinationController.js
│   │   ├── packageController.js
│   │   ├── inquiryController.js
│   │   ├── bookingController.js
│   │   ├── dashboardController.js
│   │   ├── vehicleController.js
│   │   ├── aiController.js
│   │   ├── pdfController.js
│   │   ├── publicController.js
│   │   └── quotationController.js
│   ├── middleware
│   │   └── authMiddleware.js
│   ├── models
│   │   ├── Admin.js
│   │   ├── Destination.js
│   │   ├── TourPackage.js
│   │   ├── Inquiry.js
│   │   ├── Booking.js
│   │   └── Vehicle.js
│   ├── routes
│   │   ├── authRoutes.js
│   │   ├── destinationRoutes.js
│   │   ├── packageRoutes.js
│   │   ├── inquiryRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── vehicleRoutes.js
│   │   ├── aiRoutes.js
│   │   ├── pdfRoutes.js
│   │   ├── publicRoutes.js
│   │   └── quotationRoutes.js
│   ├── .env
│   ├── package.json
│   └── server.js
│
├── frontend
│   ├── public
│   ├── src
│   │   ├── api
│   │   │   └── axios.js
│   │   ├── components
│   │   │   ├── AIReplyGenerator.jsx
│   │   │   └── AIItineraryGenerator.jsx
│   │   ├── context
│   │   │   └── AuthContext.jsx
│   │   ├── layouts
│   │   │   └── AdminLayout.jsx
│   │   ├── pages
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Destinations.jsx
│   │   │   ├── Packages.jsx
│   │   │   ├── Inquiries.jsx
│   │   │   ├── Bookings.jsx
│   │   │   ├── Vehicles.jsx
│   │   │   └── ClientTools.jsx
│   │   ├── routes
│   │   │   └── ProtectedRoute.jsx
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

## Installation Guide

### 1. Clone Repository

```bash
git clone https://github.com/your-username/dream-ceylon-crm-mern.git
cd dream-ceylon-crm
```

---

## Backend Setup

### 2. Go to Backend Folder

```bash
cd backend
```

### 3. Install Backend Dependencies

```bash
npm install
```

### 4. Create Backend `.env` File

Create a `.env` file inside the backend folder:

```env
PORT=5000
MONGO_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/dream_ceylon_crm?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.2
```

### Important Security Note

Never upload the `.env` file to GitHub.

The `.env` file contains private credentials such as:

- MongoDB connection string
- JWT secret
- OpenAI API key

---

## Frontend Setup

### 5. Go to Frontend Folder

```bash
cd ../frontend
```

### 6. Install Frontend Dependencies

```bash
npm install
```

### 7. Create Frontend `.env` File

Create a `.env` file inside the frontend folder:

```env
VITE_API_URL=http://localhost:5000/api
```

---

## Run the Project

### Start Backend Server

Open terminal in backend folder:

```bash
cd backend
npm run dev
```

Backend will run on:

```text
http://localhost:5000
```

### Start Frontend Server

Open another terminal in frontend folder:

```bash
cd frontend
npm run dev
```

Frontend will run on:

```text
http://localhost:5173
```

---

## Default Admin Account

You can register an admin using the API:

```http
POST /api/auth/register
```

Example body:

```json
{
  "name": "Janith Dasanayaka",
  "email": "admin@dreamceylon.com",
  "password": "DreamCeylon123"
}
```

Login body:

```json
{
  "email": "admin@dreamceylon.com",
  "password": "DreamCeylon123"
}
```

---

## Backend API Routes

---

## Auth Routes

### Register Admin

```http
POST /api/auth/register
```

### Login Admin

```http
POST /api/auth/login
```

### Get Admin Profile

```http
GET /api/auth/profile
```

Protected route. Requires Bearer Token.

---

## Destination Routes

Protected admin routes:

```http
POST /api/destinations
GET /api/destinations
GET /api/destinations/:id
PUT /api/destinations/:id
DELETE /api/destinations/:id
```

Search and filter example:

```http
GET /api/destinations?keyword=sigiriya&category=Cultural&status=Active&page=1&limit=5
```

---

## Package Routes

Protected admin routes:

```http
POST /api/packages
GET /api/packages
GET /api/packages/:id
PUT /api/packages/:id
DELETE /api/packages/:id
```

Search and filter example:

```http
GET /api/packages?keyword=culture&category=Cultural&status=Active&isFeatured=true
```

---

## Inquiry Routes

Public route:

```http
POST /api/inquiries
```

Protected admin routes:

```http
GET /api/inquiries
GET /api/inquiries/:id
PUT /api/inquiries/:id
DELETE /api/inquiries/:id
```

Search and filter example:

```http
GET /api/inquiries?keyword=michael&status=New&priority=High&source=Website
```

---

## Booking Routes

Protected admin routes:

```http
POST /api/bookings
GET /api/bookings
GET /api/bookings/:id
PUT /api/bookings/:id
DELETE /api/bookings/:id
```

Search and filter example:

```http
GET /api/bookings?bookingStatus=Confirmed&paymentStatus=Partially Paid&vehicleType=SUV
```

---

## Dashboard Routes

Protected route:

```http
GET /api/dashboard/stats
```

Returns:

- Destination count
- Package count
- Vehicle count
- Inquiry count
- Booking count
- Revenue
- Monthly booking stats
- Recent inquiries
- Recent bookings

---

## Vehicle Routes

Protected admin routes:

```http
POST /api/vehicles
GET /api/vehicles
GET /api/vehicles/:id
PUT /api/vehicles/:id
DELETE /api/vehicles/:id
```

Search and filter example:

```http
GET /api/vehicles?type=SUV&status=Active&isFeatured=true
```

---

## AI Routes

Protected routes:

```http
POST /api/ai/client-reply
POST /api/ai/itinerary
```

### AI Client Reply Example

```json
{
  "clientName": "Michael Anderson",
  "country": "United States",
  "clientMessage": "We are interested in a 14-day Sri Lanka tour.",
  "travelers": 2,
  "durationDays": 14,
  "interests": "culture, wildlife, beaches, train ride",
  "tone": "Friendly and professional",
  "channel": "WhatsApp",
  "language": "English"
}
```

### AI Itinerary Example

```json
{
  "clientName": "Subham Guna",
  "country": "India",
  "travelers": 2,
  "durationDays": 10,
  "interests": "Culture, Wildlife, Food, Beach, Hill Country",
  "preferredDestinations": "Sigiriya, Kandy, Nuwara Eliya, Ella, Yala",
  "travelStyle": "Budget-friendly private tour",
  "budgetLevel": "Budget",
  "vehicleType": "Car",
  "arrivalCity": "Colombo Airport",
  "endingPreference": "Beach",
  "language": "English"
}
```

---

## Itinerary PDF Route

Protected route:

```http
POST /api/pdf/itinerary
```

This route generates a professional itinerary PDF.

Required:

```json
{
  "generatedItinerary": "Day 1: Arrival - Sigiriya...",
  "clientName": "Subham Guna",
  "country": "India",
  "travelers": 2,
  "durationDays": 10,
  "interests": "Culture, Wildlife, Food, Beach",
  "preferredDestinations": "Sigiriya, Kandy, Ella, Yala",
  "travelStyle": "Budget-friendly private tour",
  "budgetLevel": "Budget",
  "vehicleType": "Car",
  "arrivalCity": "Colombo Airport",
  "endingPreference": "Beach",
  "language": "English"
}
```

---

## Quotation PDF Route

Protected route:

```http
POST /api/quotations/pdf
```

Generates a professional quotation PDF.

Example body:

```json
{
  "clientName": "Subham Guna",
  "country": "India",
  "tourTitle": "10 Days Sri Lanka Budget Private Tour",
  "travelStartDate": "2026-08-10",
  "travelEndDate": "2026-08-19",
  "travelers": 2,
  "durationDays": 10,
  "vehicleType": "Car",
  "vehicleDailyRate": 80,
  "vehicleDays": 10,
  "hotelCost": 0,
  "activitiesCost": 0,
  "entranceFeesCost": 0,
  "otherCost": 0,
  "discount": 0,
  "advancePayment": 200,
  "currency": "USD",
  "inclusions": [
    "Private air-conditioned car",
    "Professional chauffeur guide",
    "Airport pickup and drop-off",
    "Customized route planning",
    "Water bottles during transfers"
  ],
  "exclusions": [
    "Hotel accommodation",
    "Entrance fees",
    "Safari and activity fees",
    "Meals",
    "Personal expenses"
  ],
  "notes": "This quotation is based on private transport only. Hotels, entrance tickets, safari fees, and activities can be added separately according to the client's preferred budget."
}
```

---

## Public API Routes

These routes do not require login.

### Public Home Data

```http
GET /api/public/home
```

Returns:

- Popular destinations
- Featured packages
- Featured vehicles

### Public Destinations

```http
GET /api/public/destinations
GET /api/public/destinations/:id
```

Examples:

```http
GET /api/public/destinations?isPopular=true
GET /api/public/destinations?category=Cultural
```

### Public Packages

```http
GET /api/public/packages
GET /api/public/packages/:id
```

Examples:

```http
GET /api/public/packages?isFeatured=true
GET /api/public/packages?category=Wildlife
```

### Public Vehicles

```http
GET /api/public/vehicles
```

Examples:

```http
GET /api/public/vehicles?type=SUV
GET /api/public/vehicles?isFeatured=true
```

---

## Frontend Pages

### Completed Admin Pages

- Login Page
- Dashboard Page
- Destinations Page
- Packages Page
- Inquiries Page
- Bookings Page
- Vehicles Page
- Client Tools Page

### Client Tools Page Includes

- World time checker
- Quick reply templates
- Translation helper
- WhatsApp reply helper
- AI reply generator
- AI itinerary generator
- Itinerary PDF export

---

## Development Progress Checklist

### Project Setup

- [x] Created project root folder
- [x] Initialized Git repository
- [x] Created backend folder
- [x] Created frontend folder
- [x] Added `.gitignore`
- [x] Installed backend dependencies
- [x] Installed frontend dependencies
- [x] Connected MongoDB Atlas
- [x] Added environment variables
- [x] Created Express server
- [x] Created React Vite app

### Backend Core

- [x] Express server setup
- [x] MongoDB connection setup
- [x] Mongoose models setup
- [x] Error handling basics
- [x] CORS setup
- [x] JSON body parsing setup

### Authentication

- [x] Admin model
- [x] Password hashing
- [x] Admin registration
- [x] Admin login
- [x] JWT token generation
- [x] Protected route middleware
- [x] Admin profile endpoint

### Destination Module

- [x] Destination model
- [x] Create destination
- [x] Get all destinations
- [x] Get single destination
- [x] Update destination
- [x] Delete destination
- [x] Search destinations
- [x] Filter destinations
- [x] Pagination
- [x] Popular destination flag

### Package Module

- [x] Tour package model
- [x] Create package
- [x] Get all packages
- [x] Get single package
- [x] Update package
- [x] Delete package
- [x] Package itinerary support
- [x] Package inclusions
- [x] Package exclusions
- [x] Destination references
- [x] Featured package flag

### Inquiry Module

- [x] Inquiry model
- [x] Public inquiry creation
- [x] Admin inquiry listing
- [x] Inquiry search
- [x] Inquiry filter
- [x] Inquiry priority
- [x] Inquiry status management
- [x] Inquiry source management
- [x] Link inquiry to package

### Booking Module

- [x] Booking model
- [x] Create booking
- [x] Get bookings
- [x] Get single booking
- [x] Update booking
- [x] Delete booking
- [x] Booking code generation
- [x] Inquiry to booking conversion
- [x] Payment status
- [x] Booking status
- [x] Advance payment
- [x] Balance calculation support

### Vehicle Module

- [x] Vehicle model
- [x] Create vehicle
- [x] Get vehicles
- [x] Get single vehicle
- [x] Update vehicle
- [x] Delete vehicle
- [x] Vehicle type filter
- [x] Vehicle price per day
- [x] Vehicle capacity
- [x] Vehicle features
- [x] Featured vehicle flag

### Dashboard Module

- [x] Total destination count
- [x] Total package count
- [x] Total inquiry count
- [x] Total booking count
- [x] Total vehicle count
- [x] Revenue calculation
- [x] Monthly booking statistics
- [x] Recent inquiries
- [x] Recent bookings

### AI Module

- [x] OpenAI API connection
- [x] AI client reply generator
- [x] AI itinerary generator
- [x] Prompt engineering for Sri Lanka DMC use case
- [x] Protected AI endpoints
- [x] AI error handling

### PDF Module

- [x] Installed pdf-lib
- [x] Added brand configuration
- [x] Added logo support
- [x] Added vehicle image support
- [x] Created itinerary PDF generator
- [x] Created quotation PDF generator
- [x] Added watermark
- [x] Added clickable website link
- [x] Added clickable WhatsApp link
- [x] Added social media links
- [x] Added professional contact section

### Public API Module

- [x] Public home API
- [x] Public destinations API
- [x] Public packages API
- [x] Public vehicles API
- [x] Only active data returned
- [x] Public route setup for future website

### Frontend Setup

- [x] React app setup
- [x] Bootstrap setup
- [x] Axios setup
- [x] React Router setup
- [x] Auth context setup
- [x] Protected route setup
- [x] Admin layout setup
- [x] Sidebar navigation
- [x] Logout function

### Frontend Pages

- [x] Login page
- [x] Dashboard page
- [x] Destinations CRUD page
- [x] Packages CRUD page
- [x] Inquiries CRUD page
- [x] Bookings CRUD page
- [x] Vehicles CRUD page
- [x] Client tools page
- [x] AI reply generator component
- [x] AI itinerary generator component
- [x] Itinerary PDF download button

### Quotation Feature

- [x] Quotation PDF backend route
- [x] Quotation cost calculation
- [x] Quotation PDF design
- [x] Quotation Generator frontend page
- [x] Save quotations to database
- [ ] Quotation history page
- [ ] Convert quotation into booking

---

## Current Development Status

The project currently includes:

- Admin CRM backend
- Admin CRM frontend
- MongoDB Atlas database
- JWT authentication
- CRUD modules
- AI tools
- Itinerary PDF generator
- Quotation PDF generator
- Public website API routes

The next planned development step is:

```text
Quotation Generator frontend page
```

---

## Recommended Next Features

### Short-Term Improvements

- [ ] Add frontend Quotation Generator page
- [ ] Add quotation database model
- [ ] Save generated quotations
- [ ] View quotation history
- [ ] Add edit quotation option
- [ ] Add download quotation again option
- [ ] Connect quotation with inquiry
- [ ] Connect quotation with booking

### Medium-Term Improvements

- [ ] Add role-based admin users
- [ ] Add image upload instead of image URL
- [ ] Add Cloudinary or Firebase Storage
- [ ] Add customer follow-up reminders
- [ ] Add email sending
- [ ] Add WhatsApp message templates
- [ ] Add booking calendar
- [ ] Add invoice PDF
- [ ] Add receipt PDF

### Long-Term Improvements

- [ ] Build public website with Next.js
- [ ] Connect public website to `/api/public`
- [ ] Add online inquiry form
- [ ] Add SEO-friendly destination pages
- [ ] Add SEO-friendly package pages
- [ ] Add blog system
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Add custom domain
- [ ] Add SSL
- [ ] Add analytics

---

## Example Vehicle Pricing

| Vehicle Type | Capacity | Price Per Day |
|---|---:|---:|
| Car | 3 passengers | 80 USD |
| SUV | 4 passengers | 95 USD |
| Van | 7 passengers | 110 USD |

---

## Example Destination Categories

- Cultural
- Beach
- Wildlife
- Hill Country
- Adventure
- City
- Religious
- Other

---

## Example Package Categories

- Cultural
- Beach
- Wildlife
- Adventure
- Honeymoon
- Family
- Luxury
- Budget
- Round Tour
- Other

---

## Example Inquiry Statuses

- New
- Contacted
- Follow Up
- Converted
- Cancelled

---

## Example Booking Statuses

- Pending
- Confirmed
- In Progress
- Completed
- Cancelled

---

## Example Payment Statuses

- Pending
- Partially Paid
- Paid
- Refunded

---

## Git Commands

### Check Status

```bash
git status
```

### Add Files

```bash
git add .
```

### Commit Changes

```bash
git commit -m "Your commit message"
```

### Push to GitHub

```bash
git push
```


---

## Environment Variables

### Backend `.env`

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.2
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:5000/api
```

---

## Security Notes

- Do not commit `.env` files.
- Do not expose OpenAI API key in frontend.
- Do not expose MongoDB credentials.
- Use JWT authentication for admin-only routes.
- Use strong admin passwords.
- Restrict MongoDB Atlas network access before production deployment.
- Rotate API keys if accidentally exposed.
- Use HTTPS in production.

---

## Deployment Notes

This project currently runs locally.

For production deployment, the recommended structure is:

### Backend

Can be deployed on:

- Render
- Railway
- VPS
- DigitalOcean
- AWS
- Azure
- Google Cloud

### Frontend

Can be deployed on:

- Vercel
- Netlify
- Render
- Firebase Hosting

### Database

- MongoDB Atlas

### Public Website

Future website can be built with:

- Next.js
- React
- WordPress frontend with custom API integration
- Any frontend that can consume REST APIs

---

## Local Development URLs

Backend:

```text
http://localhost:5000
```

Frontend:

```text
http://localhost:5173
```

Public API example:

```text
http://localhost:5000/api/public/home
```

---

## Testing Guide

### Backend Testing with Postman

1. Start backend server.
2. Register admin.
3. Login admin.
4. Copy JWT token.
5. Use Bearer Token for protected routes.
6. Test CRUD endpoints.
7. Test AI endpoints.
8. Test PDF endpoints using Send and Download.

### Frontend Testing

1. Start frontend server.
2. Login using admin credentials.
3. Test sidebar navigation.
4. Test dashboard stats.
5. Add destinations.
6. Add packages.
7. Add inquiries.
8. Convert inquiry to booking.
9. Add vehicles.
10. Test AI reply generator.
11. Test AI itinerary generator.
12. Download itinerary PDF.

---

## Sample Admin Workflow

```text
1. Admin logs in
2. Admin adds destinations
3. Admin creates tour packages
4. Client submits inquiry
5. Admin reviews inquiry
6. Admin uses AI reply generator
7. Admin generates AI itinerary
8. Admin downloads itinerary PDF
9. Admin creates quotation PDF
10. Client confirms tour
11. Admin converts inquiry to booking
12. Admin tracks payment and booking status
```

---

## Sample Public Website Workflow

```text
1. Public website requests /api/public/home
2. Website displays popular destinations
3. Website displays featured packages
4. Website displays vehicle pricing
5. Client submits inquiry
6. Inquiry is saved in CRM
7. Admin follows up through CRM
```

---

## Screenshots

Add screenshots here later.

```text
screenshots/login.png
screenshots/dashboard.png
screenshots/destinations.png
screenshots/packages.png
screenshots/inquiries.png
screenshots/bookings.png
screenshots/vehicles.png
screenshots/client-tools.png
screenshots/itinerary-pdf.png
screenshots/quotation-pdf.png
```

---

## Project Purpose

This project was created to demonstrate practical full-stack development skills using a real business scenario.

It includes:

- Backend API development
- Frontend admin dashboard development
- Authentication
- Database modeling
- Search and filtering
- Pagination
- PDF generation
- AI integration
- Public API design
- Real-world CRM workflow

---

## Author

**Janith Dasanayaka**

Project built for Dream Ceylon Journeys.

---

## License

This project is for educational, portfolio, and business demonstration purposes.

---

## Final Note

Dream Ceylon CRM is not just a simple CRUD project.  
It is a real-world DMC business management system with admin tools, AI assistance, document generation, and website-ready public APIs.

The project can be expanded into a complete travel business platform with:

- Public website
- Client portal
- Online booking
- Payment gateway
- Email automation
- WhatsApp automation
- Advanced reporting
- Multi-admin support
