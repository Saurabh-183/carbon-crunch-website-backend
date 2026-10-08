import { PostHog } from 'posthog-node';
import dotenv from 'dotenv';
dotenv.config();

let posthogClient = null;

if (process.env.POSTHOG_API_KEY) {
  posthogClient = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  });
} else {
  console.warn("POSTHOG_API_KEY is not defined in .env. PostHog events will not be sent.");
}

export default posthogClient;
