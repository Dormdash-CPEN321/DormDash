# Backend Setup

## Requirements

- [Node.js](https://nodejs.org/en/download/) 18+ installed on your machine
- [MongoDB](https://www.mongodb.com/) instance running locally or remotely

## Setup

1. **Install dependencies**:

   ```
   npm install
   ```

2. **API Keys:** Obtain a [Stripe](https://docs.stripe.com/keys) API key

3. **Environment Configuration**: Create a `.env` file in the root directory using the following format:

   ```
    PORT=3000
    JWT_SECRET=your_generated_secret_value
    GOOGLE_CLIENT_ID=google_web_client_id
    MONGODB_URI=mongodb_uri
    STRIPE_SECRET_KEY=stripe_secret_key
    STRIPE_PUBLISHABLE_KEY=stripe_publishable_key
   ```

4. **Firebase Setup:** Obtain `serviceAccountKey.json` and put it in the root backend folder
- Go to the Firebase Console
- Open Project Settings → Service Accounts
- Click Generate New Private Key
- Confirm and download the generated `serviceAccountKey.json` file
- You can also refer to this [video](https://www.youtube.com/watch?v=1ABYkh5xb5M)

3. **Start development server**: Start development server with ts-node with auto-reload
   ```
   npm run dev
   ```

## Build and Run

- **Build**: Compile TypeScript to JavaScript
  ```
  npm run build
  ```
- **Start production**: Run compiled JavaScript
  ```
  npm start
  ```

## API Endpoints

The server runs on port 3000 (configurable via PORT env var) with the following routes:

- `/api/auth/*` - Authentication
- `/api/user/*` - User management
- `/api/order/*` - Order management
- `/api/jobs/*` - Job management
- `/api/payment/*` - Payment
- `/api/routePlanner/*` - Optimal route management
- `/api/load-test/*` - For running non-functional requirement load test
- `/api/dev/*` - For automation of E2E tests

## Code Formatting

### Prettier Setup

Prettier is configured to automatically format your code. The configuration is in `.prettierrc`.

- **Run format checking**:
  ```
  npm run format
  ```
- **Format code**:
  ```
  npm run format:fix
  ```

**VS Code Integration**: Install the Prettier extension for automatic formatting on save.
