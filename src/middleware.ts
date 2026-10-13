import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Legacy / mistaken URLs reported in Search Console (404). */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/$" || pathname === "/%24") {
    return NextResponse.redirect(new URL("/", request.url), 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/$", "/%24"],
};
