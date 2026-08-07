# 🎓 ClassTrack AI

> A modern AI-ready classroom management platform for educational institutions.

ClassTrack AI is a full-stack classroom management system designed for schools, colleges, coaching institutes, and online education platforms. It enables administrators, teachers, and students to collaborate through a secure, role-based environment while being architected for future AI-powered features such as automated evaluation, analytics, and intelligent feedback.

---

## ✨ Current Status

> 🚧 Active Development

The project is being developed in production-style iterative sprints.

### Completed Modules

- ✅ Enterprise Authentication
- ✅ JWT Authentication & Refresh Tokens
- ✅ Role-Based Access Control (RBAC)
- ✅ Admin Dashboard
- ✅ Teacher Dashboard
- ✅ Classroom Management
- ✅ Assignment / Task Management
- ✅ Audit Logging
- ✅ Notification Framework
- ✅ Production Database Schema
- ✅ Responsive Teacher UI

---

# 🚀 Features

## 🔐 Authentication

- Secure Login
- JWT Access Tokens
- Refresh Token Rotation
- Logout
- Password Hashing (bcrypt)
- Login History
- Failed Login Tracking
- Account Lockout Protection
- Role Based Authentication

---

## 👨‍💼 Admin Module

- Dashboard
- Teacher Management
- Classroom Management
- Statistics
- Audit Logs
- System Monitoring

---

## 👨‍🏫 Teacher Module

### Dashboard

- Overview Statistics
- Recent Activity
- Quick Actions

### Classroom Management

- Create Classroom
- Edit Classroom
- Archive Classroom
- Restore Classroom
- Delete Classroom (Soft Delete)
- Generate Join Code
- Search
- Filters
- Pagination

### Assignment Management

- Create Assignment
- Update Assignment
- Delete Assignment
- Publish Assignment
- Unpublish Assignment
- Search
- Sort
- Filters
- Pagination

---

## 👨‍🎓 Student Module

Currently Available

- Secure Authentication
- Role-based Access

🚧 In Progress

- Assignment Dashboard
- Assignment Submission
- Submission History
- Progress Tracking

---

# 🏗️ Project Architecture

```
ClassTrack AI

├── Backend (Node.js + Express)
│
├── Frontend (React + TypeScript)
│
├── MySQL Database
│
└── REST API
```

---

# 🛠️ Technology Stack

## Backend

- Node.js
- Express.js
- MySQL
- JWT
- Bcrypt
- Joi Validation
- Express Middleware

## Frontend

- React
- TypeScript
- Material UI
- React Router
- Axios
- React Hook Form

## Database

- MySQL

## Testing

- Jest
- Supertest

---

# 📂 Project Structure

```
classTrackv1/

│
├── classTrackv1-backend/
│   ├── server/
│   ├── database.sql
│   └── README.md
│
├── classTrackv1-frontend/
│   ├── src/
│   └── public/
│
└── README.md
```

---

# 🗄 Database

The project maintains a single source of truth.

```
database.sql
```

Every backend feature that introduces:

- Tables
- Columns
- Indexes
- Foreign Keys
- Constraints

is updated simultaneously in **database.sql**.

No schema drift is allowed.

---

# 🔒 Security Features

- JWT Authentication
- Refresh Token Rotation
- Password Hashing
- RBAC
- Permission-based Authorization
- Soft Delete Support
- Request Validation
- Audit Logging
- Secure Middleware

---

# 📈 Current Development Roadmap

## ✅ Phase 1

- Authentication
- RBAC
- Admin Module

Completed ✔️

---

## ✅ Phase 2

Teacher Module

Completed ✔️

- Dashboard
- Classroom Management
- Assignment Management

---

## 🚧 Phase 3

Student Module

- Assignment Dashboard
- Assignment Submission
- Submission Tracking
- Grades

---

## ⏳ Phase 4

Teacher Evaluation

- Review Submissions
- Manual Grading
- Feedback
- Reports

---

## ⏳ Phase 5

AI Features

- AI Assignment Evaluation
- AI Feedback
- AI Performance Insights
- AI Recommendations

---

## ⏳ Phase 6

Advanced Analytics

- Student Analytics
- Teacher Analytics
- Attendance Analytics
- Institution Reports

---

# 🚀 Getting Started

## Clone Repository

```bash
git clone <repository-url>

cd classTrackv1
```

---

## Backend

```bash
cd classTrackv1-backend/server

npm install

npm run dev
```

---

## Frontend

```bash
cd classTrackv1-frontend

npm install

npm start
```

---

## Database

Create a MySQL database.

Import:

```
database.sql
```

Update:

```
.env
```

with your database credentials.

---

# 📋 Development Principles

This project follows production development practices.

Every sprint includes:

- Repository Review
- Backend Development
- Frontend Development
- Database Synchronization
- Validation
- Testing
- Documentation

No incomplete features are merged.

---

# 📊 Development Progress

| Module | Status |
|---------|--------|
| Authentication | ✅ Complete |
| RBAC | ✅ Complete |
| Admin Module | ✅ Complete |
| Teacher Dashboard | ✅ Complete |
| Classroom Management | ✅ Complete |
| Assignment Management | ✅ Complete |
| Student Module | 🚧 In Progress |
| Submission System | ⏳ Planned |
| Evaluation | ⏳ Planned |
| AI Integration | ⏳ Planned |
| Analytics | ⏳ Planned |

---

# 🤝 Contributing

This project follows a sprint-based development workflow.

Each sprint must:

- Review existing architecture
- Avoid duplicate logic
- Keep backend and frontend synchronized
- Keep database.sql synchronized
- Include testing
- Preserve backward compatibility

---

# 📄 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Ram Wagh**

Full Stack Developer | AI Enthusiast | Cloud & DevOps Learner

Building production-ready educational software with modern web technologies.

---

## ⭐ Vision

ClassTrack AI aims to become a modern AI-powered classroom management platform capable of serving educational institutions with secure administration, intelligent automation, scalable architecture, and future-ready AI-assisted learning workflows.