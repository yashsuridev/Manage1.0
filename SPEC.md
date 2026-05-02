# Hostel Fees Management System - Specification

## 1. Project Overview

- **Project Name**: Hostel Fees Management System
- **Type**: Single-page web application with Firebase backend
- **Core Functionality**: Manage student fees with installment tracking, dashboard analytics, and real-time Firebase synchronization
- **Target Users**: Hostel administrators, fee managers

## 2. Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Firebase Firestore & Firebase Auth
- **Design**: Glassmorphism with dark neon gradient theme

## 3. File Structure

```
Management/
├── index.html      # Main dashboard application
├── login.html      # Login page with authentication
├── SPEC.md         # This specification
```

## 4. Features

### Authentication
- Login page with email/password
- Demo mode: `admin@hostel.com` / `admin123`
- Session management via sessionStorage
- Logout functionality

### Student Management
- Add student with: Name, Phone Number, Room Number, Total Fees
- All data stored in Firebase Firestore
- Auto-clear form after submission
- Success alerts on add/update

### Installment System
- Total fees divided into 3 equal installments
- Boolean fields: installment1, installment2, installment3
- Actual amount paid tracked per installment: paid1, paid2, paid3
- Visual ✔️/❌ indicators in table
- Partial payment support - pay any amount that auto-fills installments

### Dashboard Cards (Glassmorphism)
- Total Students count
- Students Fully Paid count
- Defaulters count (unpaid installments)
- Total Due Amount (currency formatted)

### Filter System
- **All Students** - Show all students
- **All Defaulters** - Show students with any pending installments
- **Inst 1 Pending** - Show students who haven't completed 1st installment
- **Inst 2 Pending** - Show students who haven't completed 2nd installment
- **Inst 3 Pending** - Show students who haven't completed 3rd installment
- **Fully Paid** - Show students with all fees paid
- Search by student name or phone number

### Student Table
- Columns: Name | Phone | Room | Inst 1 | Inst 2 | Inst 3 | Due | Actions
- Due amount highlighted in red
- Action buttons to mark each installment paid
- Smooth fade-in animation for rows

### Partial Payment Modal
- Shows student fee breakdown
- Progress per installment (percentage)
- Input any amount (max = remaining due)
- Auto-distributes payment to installments in order (1 → 2 → 3)

### UI/UX
- Glassmorphism cards (transparent, blur, soft shadows)
- Dark gradient background with neon accents
- Rounded corners (15px+)
- Hover lift effects on cards
- Button hover animations
- Responsive mobile-friendly layout
- Toast notifications
- Floating particles animation on login page

## 5. Firebase Configuration

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 6. Firestore Structure

```
students (collection)
  └── document
        ├── name: string
        ├── phone: string
        ├── room: string
        ├── totalFees: number
        ├── installment1: boolean
        ├── installment2: boolean
        ├── installment3: boolean
        ├── paid1: number
        ├── paid2: number
        ├── paid3: number
        └── createdAt: timestamp
```

## 7. Demo Credentials

- **Email**: admin@hostel.com
- **Password**: admin123
