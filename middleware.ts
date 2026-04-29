import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher([
  '/chat(.*)',
  '/hub(.*)',
  '/profile(.*)',
  '/api/chat(.*)',
  '/api/trips(.*)',
  '/api/profile(.*)',
  '/api/teams(.*)',
  '/api/stripe/checkout(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
