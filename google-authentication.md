# Google Authentication For PasteClean

## Goal

Add Google sign-in to PasteClean while keeping the current React + Vite app easy to maintain.

## Current App Reality

- Frontend: React + Vite
- Backend: none
- Storage today: browser `localStorage`
- Product direction today: local-first and privacy-first

Because the app is currently client-only, Google authentication changes the product model a bit. If users sign in, we should be clear about why they are signing in:

- account-based sync
- saved settings across devices
- premium access
- team workspaces
- cloud backup

If none of those are needed yet, adding login may create more complexity than value.

## Recommended Approach

Use **Firebase Authentication with Google as the provider**.

Why this is the best fit for this app:

- it works well with React SPAs
- it avoids building your own auth backend first
- session handling is simpler than wiring raw Google Identity tokens manually
- it gives you a clean upgrade path if you later add Firestore, cloud sync, or user profiles

## Alternative Approach

Use **Google Identity Services directly** only if:

- you only need a Google sign-in button
- you do not need a custom backend session yet
- you are comfortable handling identity tokens carefully

For this app, Firebase Auth is the more practical choice.

## High-Level Flow

1. User clicks `Continue with Google`
2. Google popup opens
3. User selects an account
4. Firebase returns the authenticated user
5. App stores auth state in memory
6. UI updates to show signed-in status
7. Optional later step: sync history/settings to cloud per user

## Google Cloud Setup

1. Create or choose a Google Cloud project.
2. Configure the Google Auth Platform branding / consent screen.
3. Create OAuth credentials for a web application.
4. Add allowed JavaScript origins.
5. If needed, add authorized redirect URIs.

Typical local origin:

```txt
http://localhost:5173
```

Typical production origin:

```txt
https://your-domain.com
```

## Firebase Setup

1. Create a Firebase project linked to the same Google Cloud project.
2. Add a Web app in Firebase.
3. Enable **Authentication**.
4. Enable **Google** as a sign-in provider.
5. Copy the Firebase web config into environment variables.

## Suggested Environment Variables

Create a `.env` file for local development:

```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
```

## Suggested File Structure

If you implement this later, this structure fits the current app:

```txt
src/
  auth/
    firebase.js
    googleAuth.js
    AuthContext.jsx
  components/
    GoogleSignInButton.jsx
    UserMenu.jsx
```

## Suggested Implementation Plan

### 1. Install dependency

```bash
npm install firebase
```

### 2. Create Firebase bootstrap

`src/auth/firebase.js`

Responsibilities:

- initialize Firebase app
- export `auth`

### 3. Create Google auth helpers

`src/auth/googleAuth.js`

Responsibilities:

- `signInWithGoogle()`
- `signOutUser()`
- provider configuration

### 4. Create auth context

`src/auth/AuthContext.jsx`

Responsibilities:

- hold `user`
- hold `isAuthLoading`
- subscribe to auth changes
- expose sign-in and sign-out actions

### 5. Wrap the app

Update the root render so the app is inside `AuthProvider`.

### 6. Add UI

Good placement options for this app:

- top-right area near the existing profile icon
- profile menu
- onboarding section for future cloud sync

## UX Recommendation For PasteClean

Since PasteClean is currently local-first, avoid forcing login on first load.

Recommended UX:

- keep the app usable without signing in
- show `Sign in with Google` only for optional cloud features
- label clearly what signing in unlocks

Good example copy:

```txt
Sign in with Google to sync your history and settings across devices.
```

## Privacy Recommendation

This is important for this product.

If you add Google authentication, update these pages:

- Privacy Policy
- Terms of Use

You should explain:

- what account data is collected
- whether email/name/photo are stored
- whether paste history remains local or syncs to cloud
- whether Google account data is shared with third parties

## Security Notes

- Do not hardcode secrets outside env vars.
- Do not trust client auth alone for backend authorization.
- If you later add a backend, verify Firebase ID tokens server-side.
- Keep scopes minimal.
- If you only need sign-in, avoid requesting extra Google API scopes.

## Product Decision To Make First

Before implementation, decide which of these is true:

### Option A. Login is optional

Best for the current app.

- anonymous usage still works
- Google sign-in unlocks sync/profile features

### Option B. Login is required

Higher friction.

- only makes sense if PasteClean becomes a cloud product
- weak fit for the current privacy-first positioning

## My Recommendation For This App

Choose **optional login with Firebase Authentication + Google provider**.

That gives you:

- minimal auth complexity
- a clean React integration path
- room to add user sync later
- less conflict with the app's current local-first promise

## Implementation Checklist

- create Google Cloud project
- configure consent screen
- create web OAuth client
- create Firebase project
- enable Google provider in Firebase Auth
- add Firebase env vars
- install `firebase`
- create auth helpers
- create `AuthProvider`
- add sign-in button in profile area
- add sign-out action
- update privacy and terms pages
- decide whether history remains local or syncs

## Official References

- Google Auth Platform / Sign in with Google setup:
  https://developers.google.com/identity/oauth2/web/guides/load-3p-authorization-library
- Google OAuth consent screen:
  https://developers.google.com/workspace/guides/configure-oauth-consent
- Google OAuth for web apps:
  https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works

## Suggested Next Step

If you want, the next step I can do is one of these:

1. implement the Google sign-in UI in this app
2. scaffold the auth files without fully enabling them
3. add Firebase and wire the full auth flow
