// js/core/auth.js

const SUPABASE_URL = "https://tmgqamxfsezqbanecfsu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZ3FhbXhmc2V6cWJhbmVjZnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjYwMTUsImV4cCI6MjA5MjgwMjAxNX0.t6pVz91F8JeWtZMJKrBG2XYLRHXh8VejdZtRps9K6RM";

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isSignUp = false;

export async function initAuth() {
    const overlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const toggleBtn = document.getElementById('toggle-auth-mode');
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('btn-auth-submit');
    const googleBtn = document.getElementById('btn-google-auth');
    
    const usernameWrapper = document.getElementById('username-wrapper');
    const usernameInput = document.getElementById('auth-username');
    const orgWrapper = document.getElementById('org-wrapper');
    const orgInput = document.getElementById('auth-org');

    // 1. Initial Session Check
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuthState(session);

    // 2. Listen for Auth State Changes (Handles redirects after Google Login)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        handleAuthState(session);
    });

    // 3. Toggle Mode Logic (Sign In vs Sign Up)
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            isSignUp = !isSignUp;
            
            if (isSignUp) {
                subtitle.innerText = "Create a new account to start analyzing.";
                submitBtn.innerText = "Create Account";
                toggleBtn.innerHTML = "Already have an account? <span class='link'>Sign In</span>";
                usernameWrapper.classList.remove('hidden');
                orgWrapper.classList.remove('hidden');
                usernameInput.required = true;
                orgInput.required = true;
            } else {
                subtitle.innerText = "Sign in to access your local data vault.";
                submitBtn.innerText = "Sign In";
                toggleBtn.innerHTML = "New here? <span class='link'>Create an account</span>";
                usernameWrapper.classList.add('hidden');
                orgWrapper.classList.add('hidden');
                usernameInput.required = false;
                orgInput.required = false;
            }
        });
    }

    // 4. Handle Email/Password Submission
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const username = usernameInput.value;
            const organization = orgInput.value;

            submitBtn.innerText = isSignUp ? "Creating..." : "Verifying...";
            submitBtn.disabled = true;

            if (isSignUp) {
                const { error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            display_name: username,
                            org_id: organization.trim().toLowerCase()
                        }
                    }
                });
                if (error) alert("Signup Error: " + error.message);
                else alert("Success! Check your email for a confirmation link.");
            } else {
                const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) alert("Login Error: " + error.message);
            }

            submitBtn.innerText = isSignUp ? "Create Account" : "Sign In";
            submitBtn.disabled = false;
        });
    }

    // 5. Handle Google OAuth Trigger
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin // Redirects back to your app
                }
            });
            if (error) alert("Google Login Error: " + error.message);
        });
    }
}

/**
 * Validates session and handles B2B onboarding for Google users
 */
async function handleAuthState(session) {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;

    if (session) {
        const user = session.user;
        const orgId = user.user_metadata?.org_id;

        // 🚀 THE B2B GOOGLE CHECK: 
        // If a user logs in via Google for the first time, they won't have an org_id.
        // We force them to provide one before letting them into the app.
        if (!orgId) {
            const orgName = prompt("Welcome! Please enter your Organization Name (Company Name) to initialize your workspace:");
            
            if (!orgName || orgName.trim().length < 2) {
                alert("An Organization Name is required to use Krata AI.");
                await supabaseClient.auth.signOut();
                return;
            }

            // Update user metadata permanently with the Org name
            const { error } = await supabaseClient.auth.updateUser({
                data: { 
                    org_id: orgName.trim().toLowerCase(),
                    display_name: user.user_metadata?.full_name || user.email.split('@')[0]
                }
            });

            if (!error) {
                // Hard refresh to ensure all downstream modules (Workspace/Library) 
                // load the correct data using the new org_id metadata
                window.location.reload(); 
            } else {
                alert("Failed to initialize workspace: " + error.message);
            }
            return;
        }

        // User is fully authenticated and has an Org ID
        overlay.classList.add('auth-hidden');
        window.dispatchEvent(new CustomEvent('user-authenticated', { detail: user }));
    } else {
        // No session, show the login screen
        overlay.classList.remove('auth-hidden');
    }
}

export async function logout() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

/**
 * UPDATE USER PROFILE
 * Updates Supabase Auth Metadata (display_name and org_id)
 */
export async function updateUserProfile(newUsername, newOrg) {
    const { data, error } = await supabaseClient.auth.updateUser({
        data: { 
            display_name: newUsername,
            org_id: newOrg.trim().toLowerCase() 
        }
    });

    if (error) throw error;
    return data;
}