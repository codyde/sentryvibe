import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  try {
    return await handler.GET(request);
  } catch (error) {
    console.error("[Auth GET] Full error:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    return await handler.POST(request);
  } catch (error) {
    console.error("[Auth POST] Full error:", error);
    throw error;
  }
}
