import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Public page before sign-in: what ScholarScope does and how to start. */
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  template: `
    <section class="hero">
      <h1>Every scholarship requirement, with the sentence it came from.</h1>
      <p class="lead">
        ScholarScope keeps track of the deadlines, essays and documents for each scholarship you apply to.
        Every requirement links to the exact page and sentence in the official guidelines, and you hear about it when they change.
      </p>
      <div class="actions">
        <a class="button" routerLink="/login" [queryParams]="{ mode: 'signup' }">Create a free account</a>
        <a class="button secondary" routerLink="/login">Sign in</a>
      </div>
    </section>

    <section aria-labelledby="how">
      <h2 id="how">How it works</h2>
      <ol class="steps">
        <li class="card">
          <strong>Find or add scholarships</strong>
          <p>Search the catalog by deadline, GPA and what the application asks for, or add one that isn't listed. Track up to 15 at a time.</p>
        </li>
        <li class="card">
          <strong>Add the official guidelines</strong>
          <p>Upload the PDF, Word file or photo, or paste the web page. Each requirement is quoted from the source; anything we can't find there is marked <em>Unverified</em>.</p>
        </li>
        <li class="card">
          <strong>Stay on top of it</strong>
          <p>Tick items off, get reminders 14, 7, 3 and 1 days before each deadline, and see changes to the guidelines side by side.</p>
        </li>
      </ol>
    </section>

    <section aria-labelledby="features">
      <h2 id="features">What else it does</h2>
      <ul class="cards">
        <li class="card">
          <strong>Document library and checks</strong>
          <p>Keep transcripts, certificates and your passport in one place. An AI check flags the wrong file, a name that doesn't match, or a passport that expires before the deadline.</p>
        </li>
        <li class="card">
          <strong>Essay drafts from your own notes</strong>
          <p>Write what you did; get a first draft that uses only your notes and marks any sentence that isn't based on them. Nothing is sent until you approve it.</p>
        </li>
        <li class="card">
          <strong>Calendar and checklist exports</strong>
          <p>Add every deadline to your calendar, download the checklist as a spreadsheet, or print it.</p>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>Your data</h2>
      <p>
        Uploads are virus-scanned before anything reads them. Instructions hidden inside documents are ignored. You can delete everything,
        including your account, from your profile at any time. While ScholarScope runs on a free AI tier, use test documents rather than real records.
      </p>
    </section>
  `,
})
export class LandingPage {}
