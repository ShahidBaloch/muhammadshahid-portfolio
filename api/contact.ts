// Vercel Function for the contact form (POST /api/contact). The rest of the site is static.
import { handleContact } from "../src/lib/contact-handler";

export function POST(request: Request): Promise<Response> {
  return handleContact(request);
}
