import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    // 1. CRITICAL: Await the cookies in Next.js 15
    const cookieStore = await cookies() 
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // 2. Swap the code for a permanent session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // 3. Redirect back to where the user was going (usually the dashboard)
      const forwardTo = new URL(next, origin)
      return NextResponse.redirect(forwardTo)
    }
  }

  // 4. If the code exchange fails, send them back to login with a specific error
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`)
}
