/**
 * server/tests/setup.js
 *
 * Sets the minimum environment variables required by config/index.js
 * so tests can import the app without a real .env file.
 */
process.env.DB_HOST     = 'localhost';
process.env.DB_USER     = 'test_user';
process.env.DB_PASSWORD = 'test_pass';
process.env.DB_NAME     = 'classtrack_test';
process.env.JWT_SECRET  = 'test_jwt_secret_that_is_long_enough';
process.env.GROQ_API_KEY = 'test_groq_key';
process.env.NODE_ENV    = 'test';
