import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // 1. Initialize the response early
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 2. Setup the Supabase client with strict env variables
  // We use ! to ensure the app crashes if these are missing,
  // rather than failing silently with placeholders.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update the request cookies (for the current server execution)
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );

          // Refresh the response to include the new request headers
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });

          // Update the response cookies (for the browser to save)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 3. Refresh the session if it exists
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 4. Route Protection Logic
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth/callback');

  // If no user and trying to access the dashboard -> Kick to login
  if (!user && !isLoginPage && !isAuthCallback) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If user is logged in but trying to access the login page -> Kick to dashboard
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

// Ensure the middleware runs on all routes except static assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Public images (png, jpg, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};