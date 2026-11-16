import { defineEventHandler } from "nuxt/server";

/** Pages outside `content/` that the Docus sitemap cannot see. Keep in step with `app/pages/`. */
const PAGES = ["/explorer"];

/** The Vue pages, handed to `@nuxtjs/sitemap` beside the Docus ones. */
export default defineEventHandler(() => PAGES);
