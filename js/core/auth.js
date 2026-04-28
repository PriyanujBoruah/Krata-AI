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
    
    // NEW: Username elements
    const usernameWrapper = document.getElementById('username-wrapper');
    const usernameInput = document.getElementById('auth-username');

    // 1. Initial Session Check
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuthState(session);

    supabaseClient.auth.onAuthStateChange((event, session) => {
        handleAuthState(session);
    });

    // 2. Toggle Mode Logic
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            isSignUp = !isSignUp;
            
            if (isSignUp) {
                subtitle.innerText = "Create a new account to start analyzing.";
                submitBtn.innerText = "Create Account";
                toggleBtn.innerHTML = "Already have an account? <span class='link'>Sign In</span>";
                usernameWrapper.classList.remove('hidden'); // Show Username
                usernameInput.required = true;
            } else {
                subtitle.innerText = "Sign in to access your local data vault.";
                submitBtn.innerText = "Sign In";
                toggleBtn.innerHTML = "New here? <span class='link'>Create an account</span>";
                usernameWrapper.classList.add('hidden'); // Hide Username
                usernameInput.required = false;
            }
        });
    }

    // 3. Handle Form Submission
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const username = usernameInput.value;

            submitBtn.innerText = isSignUp ? "Creating..." : "Verifying...";
            submitBtn.disabled = true;

            if (isSignUp) {
                // REGISTRATION with Metadata
                const { error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            display_name: username // This saves to user_metadata
                        }
                    }
                });
                if (error) alert("Signup Error: " + error.message);
                else alert("Success! Check your email for a confirmation link.");
            } else {
                // LOGIN
                const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) alert("Login Error: " + error.message);
            }

            submitBtn.innerText = isSignUp ? "Create Account" : "Sign In";
            submitBtn.disabled = false;
        });
    }
}

function handleAuthState(session) {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;

    if (session) {
        overlay.classList.add('auth-hidden');
        // You can now access the username via: session.user.user_metadata.display_name
        window.dispatchEvent(new CustomEvent('user-authenticated', { detail: session.user }));
    } else {
        overlay.classList.remove('auth-hidden');
    }
}

export async function logout() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}
