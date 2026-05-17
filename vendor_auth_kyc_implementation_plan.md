# 📋 Vantyrn Vendor Auth + KYC Onboarding Implementation Plan

This implementation plan outlines the exact file modifications, targeted endpoints, state management hooks, and database operations needed to implement the re-engineered vendor authentication and KYC onboarding workflow.

---

## 📅 Phase 1: Database & Server-Side Implementation

We will add a `/verify-phone` confirmation API, modify `/auth/google-login` to handle unique placeholders, and protect operational routes.

### 1. Update `/auth/google-login` in [server/routes/vendor.js](file:///c:/mohd%20zaid%20khan/vendor/server/routes/vendor.js)
*   **Action:** Modify Google Sign-In registration handler.
*   **Logic:**
    *   Query `prisma.profile` by `firebaseUid = uid`.
    *   If profile **does not exist**:
        1.  Generate a secure placeholder phone number: `+google-placeholder-${uid.substring(0, 10)}`.
        2.  Create `Profile` and `Vendor` records in a single database transaction. Set `profileStatus: 'PENDING'`, `accountStatus: 'PENDING'`, and `phoneVerified: false`.
    *   If profile **exists**:
        1.  Return the profile, linked `Vendor`, `profileStatus`, and `phoneVerified` state.
*   **Payload Output:** `{ success: true, user, profileStatus, phoneVerified, sessionToken }`.

### 2. Update KYC Submission `/profile` or `/kyc` in [server/routes/vendor.js](file:///c:/mohd%20zaid%20khan/vendor/server/routes/vendor.js)
*   **Action:** Receive business details and documents.
*   **Logic:**
    *   Save the submitted details, PAN, and Bank details.
    *   Store their actual phone number under `Vendor.phoneTemp` (a temporary field, or just save it inside the `Vendor` table, but keep the placeholder in `Profile.phoneNumber` to prevent unique constraints crashes with existing profiles until verification!).
    *   Transition `profileStatus` to `UNDER_REVIEW` and `accountStatus` to `KYC_SUBMITTED`.

### 3. Create One-Time Phone OTP `/auth/verify-phone-payout` in [server/routes/vendor.js](file:///c:/mohd%20zaid%20khan/vendor/server/routes/vendor.js)
*   **Action:** Finalizes phone number database transitions after successful client-side OTP validation.
*   **Logic:**
    *   Retrieve the vendor record.
    *   Verify that `profileStatus === 'APPROVED'`.
    *   Perform a database transaction:
        1.  Check if their real phone number already exists on another profile. If yes, reject with a clean duplicate error.
        2.  Update `Profile.phoneNumber = realPhoneNumber`.
        3.  Update `Vendor.phone = realPhoneNumber`.
        4.  Update `Vendor.phoneVerified = true` and `Vendor.accountStatus = 'ACTIVE'`.
    *   Return success state.

### 4. Protect Endpoints in [server/middleware/kyc.js](file:///c:/mohd%20zaid%20khan/vendor/server/middleware/kyc.js)
*   **Action:** Secure operational routes (Orders, Menu, Earnings).
*   **Logic:**
    *   Verify `profile.profileStatus === 'APPROVED'` AND `profile.vendor.phoneVerified === true`.
    *   If either check fails, return `403` with a clean JSON response containing `code: 'phone_unverified'` or `code: 'kyc_unverified'`.

---

## 📅 Phase 2: Client State & Persistence (Zustand)

### 1. Update `store/authStore.js`
*   **Action:** Expand global Zustand properties and sync to AsyncStorage.
*   **New Fields:** `phoneVerified` (Boolean).
*   **Transitions:**
    *   Update `login(userData)` to capture and persist `phoneVerified` into `auth_session`.
    *   Update `initialize()` to restore `phoneVerified` upon app launch.
    *   Create action `verifyPhoneSuccess()` to toggle `phoneVerified = true` inside both Zustand and the saved `AsyncStorage` session.

---

## 📅 Phase 3: Router Security Guard & Layout Routing

### 1. Update App Routing in `app/_layout.js`
*   **Action:** Re-engineer the navigation flow constraints.
*   **Guard Logic:**
    ```javascript
    const isReadyOrActive = profileStatus === 'APPROVED' && phoneVerified === true;
    
    if (isAuthenticated && inAuthGroup) {
      if (profileStatus === 'PENDING') {
        router.replace('/vendor-register'); // Route to Step 2
        return;
      }
      if (profileStatus === 'UNDER_REVIEW' || profileStatus === 'KYC_SUBMITTED') {
        router.replace('/kyc/status'); // Route to Step 3 Vetting screen
        return;
      }
      if (profileStatus === 'APPROVED' && !phoneVerified) {
        router.replace('/auth/verify-phone'); // Route to Step 4 One-Time OTP
        return;
      }
      if (isReadyOrActive) {
        router.replace('/(vendor)'); // Dashboard Access
        return;
      }
    }
    ```

---

## 📅 Phase 4: Frontend Screen Refactoring

### 1. Simplify `app/auth/login.js`
*   **Action:** Eliminate the phone number input block from the initial interface.
*   **Interface:** Only show the premium branding, logo, and the **"Continue with Google"** login button. Google Auth is now the *mandatory* first step.

### 2. Refactor Onboarding Form (`vendor-register.js`, etc.)
*   **Action:** Collect business details and the vendor's actual phone number (which will be verified later).
*   **Field Mapping:** Input field saves their intended phone number, PAN, bank details, and business logo/banner coordinates.

### 3. Create One-Time Phone OTP Screen (`app/auth/verify-phone.js`)
*   **Action:** Create a brand new premium screen for OTP entry.
*   **Interface Flow:**
    *   Fetches the registered phone number stored during Step 2.
    *   Displays a beautiful information card: *"Please verify your registered phone number (+91 XXXXX XXXXX) to activate your store."*
    *   Contains a **"Send OTP"** button. Tapping it calls Firebase Phone Auth.
    *   Shows a verification OTP input box.
    *   Upon entering the code, it verifies the OTP against Firebase.
    *   If correct, calls the `/auth/verify-phone-payout` API, runs `verifyPhoneSuccess()`, and routes them to `/(vendor)`.

---

## 📅 Phase 5: Testing & Verification Strategy

| Test Scenario | Trigger Action | Expected Outcome |
| :--- | :--- | :--- |
| **New Sign Up** | Click Google Login | Relational records created with secure placeholders. Routes directly to Registration details form. |
| **Details Submitted** | Click Submit Details | Profile state transitions to `UNDER_REVIEW`. Screen locks to `/kyc/status`. |
| **Pending Vetting** | Tries to open `/earnings` | Middleware throws 403. Client blocks and stays on status checklist. |
| **Admin Approved** | Admin approves database record | Socket triggers redirect to `/auth/verify-phone`. Phone field is pre-filled and uneditable. |
| **One-Time Verification** | Verify OTP | Number replaces placeholder, `phoneVerified = true`. Routes to Dashboard. |
| **App Restart** | Kill app and reopen | Session loads instantly from AsyncStorage, routing vendor straight to dashboard without prompting for Google Auth or OTP. |
