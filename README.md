# 🔧 CodeOrbit Backend

A robust and scalable Node.js/Express backend API for CodeOrbit - powering code sharing, collaboration, and management features with advanced security and performance optimization.

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

## ✨ Features

- **Express.js Framework** - Fast, lightweight, and unopinionated web framework
- **MongoDB Integration** - NoSQL database with Mongoose ODM
- **Authentication** - JWT-based authentication with Passport.js
- **OAuth 2.0** - Google OAuth integration for social login
- **Security** - Comprehensive security measures including:
  - Helmet for HTTP headers security
  - Express Rate Limiting to prevent abuse
  - XSS protection with xss-clean
  - Data sanitization with express-mongo-sanitize
  - HPP (HTTP Parameter Pollution) protection
- **File Upload** - Multer integration with Cloudinary storage
- **QR Code Generation** - Dynamic QR code creation
- **Payment Integration** - Razorpay payment gateway integration
- **Image Processing** - Cloudinary integration for image management
- **Web Scraping** - Puppeteer for server-side rendering and scraping
- **Compression** - Gzip compression for response optimization
- **Logging** - Morgan HTTP request logger
- **CORS** - Cross-Origin Resource Sharing configuration
- **Testing** - Jest and Supertest for API testing
- **Code Quality** - ESLint configuration included

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | >=18.0.0 | Runtime environment |
| Express | ^4.21.1 | Web framework |
| MongoDB | ^8.9.5 | Database |
| Mongoose | ^8.9.5 | ODM |
| JWT | ^9.0.3 | Authentication |
| Passport | ^0.7.0 | Authentication middleware |
| Multer | ^1.4.5 | File upload |
| Cloudinary | ^2.9.0 | Image storage |
| Razorpay | ^2.9.6 | Payment processing |
| Puppeteer | ^24.36.0 | Web scraping |
| QRCode | ^1.5.4 | QR generation |
| Helmet | ^8.1.0 | Security headers |
| Compression | ^1.8.1 | Response compression |
| Morgan | ^1.10.1 | HTTP logging |

## 📦 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (v8 or higher) or **yarn** (v1.22 or higher)
- **MongoDB** (v4.4 or higher) - [Download](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **Git** - [Download](https://git-scm.com/)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/PratikDate01/CodeOrbit-Backend.git
   cd CodeOrbit-Backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Create environment configuration**
   ```bash
   # Create a .env file in the root directory
   cp .env.example .env
   ```

4. **Configure environment variables** (see [Environment Variables](#environment-variables))

## 🚀 Getting Started

### Development Mode

Start the development server with hot-reload using nodemon:

```bash
npm run dev
```

The API server will start at `http://localhost:5000` (or your configured PORT)

### Production Mode

Start the production server:

```bash
npm start
```

### Running Tests

Execute the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm test -- --watch
```

### Linting

Check code quality:

```bash
npm run lint
```

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### Key Endpoints

#### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout user
- `POST /auth/google` - Google OAuth login
- `POST /auth/refresh` - Refresh JWT token

#### User Management
- `GET /users/:id` - Get user profile
- `PUT /users/:id` - Update user profile
- `DELETE /users/:id` - Delete user account

#### Code/Projects
- `GET /projects` - List projects
- `POST /projects` - Create new project
- `GET /projects/:id` - Get project details
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project

#### QR Codes
- `POST /qr/generate` - Generate QR code
- `GET /qr/:id` - Get QR code details

#### Payments
- `POST /payments/create` - Create payment order
- `POST /payments/verify` - Verify payment

## 📁 Project Structure

```
CodeOrbit-Backend/
├── config/                 # Configuration files
│   └── database.js        # MongoDB connection
├── controllers/           # Route controllers
├── models/               # Database models
├── routes/               # API routes
├── middleware/           # Custom middleware
├── services/             # Business logic
├── utils/                # Utility functions
├── validators/           # Input validation schemas
├── .env.example          # Environment variables template
├── .eslintrc.json        # ESLint configuration
├── index.js              # Entry point
├── package.json          # Dependencies and scripts
├── jest.config.js        # Jest testing configuration
├── render-build.sh       # Build script for deployment
└── README.md            # This file
```

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://username:password@host:port/database
MONGODB_URI_PROD=your_production_mongodb_uri

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your_refresh_secret_key
JWT_REFRESH_EXPIRE=30d

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Cloudinary
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

## ⚙️ Configuration

### Database Connection

Update `config/database.js`:

```javascript
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
```

### CORS Configuration

Configure CORS in your main server file:

```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));
```

### Security Headers with Helmet

```javascript
const helmet = require('helmet');

app.use(helmet());
```

## ✅ Testing

### Running Tests

```bash
npm test
```

### Test Coverage

```bash
npm test -- --coverage
```

### Example Test File

```javascript
const request = require('supertest');
const app = require('../index');

describe('Auth Routes', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
    
    expect(res.statusCode).toBe(201);
  });
});
```

## 🚀 Deployment

### Render Deployment

The project includes a `render-build.sh` script for Render deployment:

```bash
chmod +x render-build.sh
./render-build.sh
```

### Environment Variables for Production

Set these in your deployment platform:
- All variables from `.env.example`
- Use production database URI
- Set `NODE_ENV=production`

### Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t codeorbit-backend .
docker run -p 5000:5000 codeorbit-backend
```

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Code Style Guidelines

- Follow ESLint configuration
- Use async/await for asynchronous operations
- Add JSDoc comments for functions
- Write tests for new features
- Update README with API changes

## 📄 License

This project is licensed under the ISC License - see the LICENSE file for details.

## 🆘 Support

- **Issues** - [GitHub Issues](https://github.com/PratikDate01/CodeOrbit-Backend/issues)
- **Documentation** - Check the docs folder for detailed guides

## 🔗 Related Projects

- [CodeOrbit Frontend](https://github.com/PratikDate01/CodeOrbit-Frontend-)

## 📞 Contact

For questions or suggestions, please reach out to:
- **GitHub** - [@PratikDate01](https://github.com/PratikDate01)

---

Made with ❤️ by the CodeOrbit Team
