# Profile page: integration guide

For the developer connecting the student profile page to the backend.

## 1. What you are getting

The profile page is finished on the front end. It works on its own with fake data, so you can click through everything before any API exists. Your job is to replace the fake parts with real API calls.

| File | What it does |
| --- | --- |
| `index.html` | The page structure: header card, email, password, countries, dialog, toast area |
| `styles.css` | All the design. Colors are in one `:root` block at the top |
| `script.js` | All behavior: validation, photo preview, country picker, toasts, and the places to add API calls |

To run it, keep the three files in one folder and open `index.html`. If you add `fetch` calls, run it from a local server (see mistake 11) instead of double-clicking the file.

You should only need to edit `script.js`. Leave `styles.css` and `index.html` alone unless the design changes.

## 2. How the page works

The page keeps the student's data in one object at the top of `script.js`:

```js
const profile = {
  name: "Aisha Rahman",
  email: "aisha@example.com",
  photo: null,        // image URL
  countries: [],      // e.g. ["Germany", "Canada"]
};
```

Every time this object changes, the page redraws itself by calling `renderHeader()` (name, email, photo, completeness bar) or `renderCountries()` (country chips).

The pattern for every action is the same:

1. The student fills in a form or clicks a button.
2. The front end checks the input (format, size, matching passwords).
3. A `// TODO: API call here` comment marks where the real request goes. Right now there is a fake 0.7 second wait called `fakeRequest()`.
4. If it worked, the `profile` object is updated and a green toast is shown.

Your work is step 3: replace `fakeRequest()` with a real request, and handle both success and failure.

## 3. The seven places to connect

Search `script.js` for `TODO` to find each one.

| # | Action | Where in `script.js` | What to send | What should happen after success |
| --- | --- | --- | --- | --- |
| 1 | Load profile | The `profile` object at the top, and the last two lines of the file | Nothing (the student is identified by their login) | Fill `profile`, then redraw |
| 2 | Upload photo | `photoInput.onchange`, inside `reader.onload` | The image file | Save the returned image URL in `profile.photo` |
| 3 | Remove photo | `photoRemove.onclick` | Nothing | Set `profile.photo = null` |
| 4 | Change email | `emailForm.onsubmit` | New email and current password | Set `profile.email` |
| 5 | Change password | `pwdForm.onsubmit` | Current password and new password | Clear the form |
| 6 | Send reset link | `fpSend.onclick` | Nothing (the server already knows the email) | Show the toast |
| 7 | Save countries | `saveCountries.onclick` | The list of country names | Set `profile.countries` |

### Suggested API shape

These endpoint names are only a suggestion. Agree on the real ones with whoever builds the backend.

| Action | Method and path | Request body | Success response |
| --- | --- | --- | --- |
| Load profile | `GET /api/profile` | none | `{ name, email, photo, countries }` |
| Upload photo | `POST /api/profile/photo` | form data with a `photo` file | `{ url }` |
| Remove photo | `DELETE /api/profile/photo` | none | 200 |
| Change email | `PATCH /api/profile/email` | `{ newEmail, currentPassword }` | 200 |
| Change password | `PATCH /api/profile/password` | `{ currentPassword, newPassword }` | 200 |
| Reset link | `POST /api/profile/password-reset` | none | 200 |
| Save countries | `PUT /api/profile/countries` | `{ countries: ["Germany", ...] }` | 200 |

## 4. Worked examples

### Example A: Load the profile (#1)

At the very bottom of `script.js`, replace the last two lines (`renderHeader(); renderCountries();`) with this:

```js
async function loadProfile() {
  try {
    const res = await fetch("/api/profile", { credentials: "include" });
    if (!res.ok) throw new Error();
    Object.assign(profile, await res.json());
    draftCountries = [...profile.countries];   // do not skip this line
    renderHeader();
    renderCountries();
  } catch {
    toast("Couldn't load your profile. Refresh and try again.", true);
  }
}
loadProfile();
```

### Example B: Change email (#4)

Inside `emailForm.onsubmit`, find `// TODO: API call here` and the `await fakeRequest();` under it. Replace the lines from there down to the success toast with:

```js
try {
  const res = await fetch("/api/profile/email", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ newEmail: email, currentPassword: pwd }),
  });
  if (res.status === 403) { setErr("emailPwdErr", "Current password is incorrect."); return; }
  if (res.status === 409) { setErr("newEmailErr", "That email is already in use."); return; }
  if (!res.ok) throw new Error();

  profile.email = email;          // only after the server said yes
  renderHeader();
  e.target.reset();
  toast("Email changed. Check your inbox to verify it.");
} catch {
  toast("Something went wrong. Please try again.", true);
}
```

The same idea works for password, reset link and countries: send the request, check the status, show the error in the right place, and only update `profile` after success.

### Example C: Upload the photo (#2)

Inside `reader.onload`, the line `profile.photo = reader.result;` currently stores the image as a long text string (a data URL). Replace the fake wait and that line with:

```js
const form = new FormData();
form.append("photo", file);
const res = await fetch("/api/profile/photo", {
  method: "POST", body: form, credentials: "include",
});
if (!res.ok) { track.hidden = true; return setErr("photoError", "Upload failed. Try again."); }
const { url } = await res.json();
profile.photo = url;
```

## 5. Common mistakes and how to fix them

### 1. Leaving `fakeRequest()` in place

**What you see:** The page says "Email changed" even when the server returned an error. **Why:** `fakeRequest()` always succeeds. **Fix:** Delete every `fakeRequest()` call once the real request is in. Search the file for it to be sure none are left.

### 2. Updating the page before the server answers

**What you see:** The header shows the new email, but the database still has the old one. **Fix:** Change `profile.email`, `profile.photo` and the others only after the response says success, as in Example B.

### 3. Forgetting the `draftCountries` line when loading the profile

**What you see:** The profile loads, but the country chips are empty or the count says "0 selected" even though the student saved countries before. **Why:** The country picker works on a separate working copy called `draftCountries`, which is created before your data arrives. **Fix:** After loading, set `draftCountries = [...profile.countries];` and call `renderCountries()`, as in Example A.

### 4. No error handling

**What you see:** The button stops spinning but nothing tells the student what went wrong. **Why:** `withLoading` re-enables the button, but it does not show errors for you. **Fix:** Wrap each request in `try/catch`. Use `setErr("fieldErrId", "message")` for problems with one field (wrong password) and `toast("message", true)` for general failures. The `true` makes the toast red.

### 5. Showing the wrong error in the wrong place

**What you see:** "Wrong password" appears under the email field, or not at all. **Fix:** Match errors to fields using these ids:

| Field | Error element id |
| --- | --- |
| New email | `newEmailErr` |
| Current password (email form) | `emailPwdErr` |
| Current password (password form) | `curPwdErr` |
| Confirm password | `confPwdErr` |
| Photo | `photoError` |

Ask the backend developer which status code means "wrong password" (this guide assumes 403) and match it.

### 6. Saving the photo as a data URL

**What you see:** Very slow pages, huge responses, or the photo disappearing after refresh. **Why:** The page uses a data URL only to preview the image. It is not meant for storage. **Fix:** Upload the real `file` object with `FormData` and store the URL the server gives back (Example C). Do not set a `Content-Type` header yourself for `FormData`; the browser adds it with the right boundary. Setting it by hand is a common cause of "file not received" errors.

### 7. Trusting only the front-end checks

**What you see:** Someone uploads a 20 MB file or a bad password and it goes through. **Why:** The page checks file type, size and password length for convenience, but anyone can bypass browser checks. **Fix:** The backend must repeat all of them. Also keep `MAX_PHOTO_MB` at the top of `script.js` equal to the backend limit. The strength meter is only a visual hint; the backend decides what is an acceptable password. The page currently requires 8 or more characters, so the backend rule must not be stricter without the front end being updated.

### 8. Country names that do not match

**What you see:** Saved countries come back from the server and some chips do not show as selected. **Why:** The page sends and expects exact names, such as `Ivory Coast`, `DR Congo`, `Czech Republic`. If the backend uses different spellings or codes (`CI`, `CD`), they will not match the list in `script.js`. **Fix:** Agree on one format before starting. If the backend uses codes, change the `COUNTRIES` and `POPULAR` lists to `{ code, name }` objects and convert in one place. If it uses names, copy the list from `script.js` to the backend.

### 9. Not sending the login with the request

**What you see:** Every request returns 401 or "not logged in". **Fix:** If login uses cookies, add `credentials: "include"` to each `fetch`. If it uses a token, add `headers: { Authorization: "Bearer " + token }`. Decide what to do on a 401 (usually send the student to the login page) and do it in one shared helper rather than in seven places.

### 10. Renaming ids or classes

**What you see:** A button stops working or a section stays blank, with an error in the browser console. **Why:** `script.js` finds elements by their `id` (like `emailForm`, `pctBar`, `selected`). Rename an id in the HTML and the JavaScript cannot find it. **Fix:** Keep the ids as they are. If you must rename one, change it in both `index.html` and `script.js`.

### 11. Requests blocked when opening the file directly

**What you see:** Red CORS errors in the console, or requests that never reach the server. **Why:** Opening `index.html` by double-clicking uses a `file://` address, and browsers block many requests from it. **Fix:** Serve the folder locally (for example, run `npx serve` in the folder, or use your editor's live server), and ask the backend developer to allow that address for CORS.

### 12. Email shown as changed before it is verified

**What you see:** The header shows the new email, but the student cannot log in with it until they click the email link. **Fix:** Decide with the team whether to update the header immediately or keep showing the old email with a note like "Verification pending: new@example.com". If it is the second, do not set `profile.email` until the server confirms verification.

### 13. Removing the loading state

**What you see:** Students click "Change email" several times and send duplicates. **Why:** The `withLoading(...)` wrapper disables the button during the request. Removing it removes that protection. **Fix:** Keep every request inside `withLoading`.

### 14. Logging or exposing passwords

**Fix:** Never `console.log` the form values, never put passwords in a URL, and make sure the site runs on HTTPS. Passwords should only travel in the request body.

## 6. Real upload progress (optional)

The progress bar under the photo currently shows how fast the browser reads the file from the computer. That is nearly instant, so it flashes quickly. If you want it to show real upload progress, use `XMLHttpRequest` for the upload and update the bar from `xhr.upload.onprogress`. `fetch` cannot report upload progress. This is optional; the page works fine without it.

## 7. Test checklist before you hand it back

Try each of these in the browser and tick them off.

- Reload the page: name, email, photo and saved countries all appear (not the fake "Aisha Rahman").
- The completeness bar matches the data (40% base, plus 30% for a photo, plus 30% for countries).
- Upload a PNG and a JPG under the limit: it shows and survives a refresh.
- Upload a GIF or a file over the limit: a red message appears and nothing is sent.
- Remove the photo: the initial letter returns and the bar drops.
- Change email with the right password: green toast, header updates (or pending state, per mistake 12).
- Change email with a wrong password: the error shows under the password field, no green toast.
- Change email to one already in use: the error shows under the email field.
- Change password with a wrong current password, then with mismatched confirm, then correctly.
- Click Forgot password, send: the toast names the registered email, and the email arrives.
- Pick countries by search and by popular chips, remove one with the x, click Save, refresh: the same countries are still selected.
- Turn the network off and try each action: a red error toast appears instead of silence.
- Click a submit button rapidly: only one request is sent.

## 8. Quick reference

| Name | What it does |
| --- | --- |
| `profile` | The student's data object |
| `draftCountries` | Unsaved country choices; copied to `profile.countries` on save |
| `renderHeader()` | Redraws name, email, photo and completeness |
| `renderCountries()` | Redraws the chips and the count |
| `renderCompleteness()` | Recalculates the percentage |
| `toast(msg, isError)` | Shows a popup; pass `true` for red |
| `setErr(id, msg)` | Shows an error under a field; pass nothing to clear |
| `withLoading(btn, label, fn)` | Disables the button while a request runs |
| `fakeRequest(ms)` | Fake delay to delete once real calls are in |
| `MAX_PHOTO_MB`, `MAX_COUNTRIES` | Limits at the top of the file |

## 
