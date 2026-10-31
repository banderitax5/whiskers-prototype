// Wording the UI shows when something fails.
//
// Rules of thumb: say what happened, then what the person can do next. Never
// surface stack traces, SQL/PostgREST errors, HTTP status codes or internal
// field names - those belong in the server log, not on screen.

export const SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.'

export const MIGRATION_REQUIRED =
  'This part of the site is waiting on a database update. Please ask the site owner to finish the setup.'

export const AUTH_REQUIRED = 'Please sign in to continue.'
export const SESSION_EXPIRED = 'Your session has expired. Please sign in again.'
export const ADMIN_ONLY = 'Only an admin can do that.'
export const STAFF_ONLY = 'Only staff or an admin can do that.'

export const INVALID_ID = 'That item could not be found. Refresh the page and try again.'
export const INVALID_LIST = 'That list contains an item we could not recognise. Refresh the page and try again.'
export const NOTHING_TO_SAVE = 'Nothing to save yet. Change at least one field and try again.'

export const IMAGE_UNREADABLE = 'That file could not be read. Try choosing it again.'
export const IMAGE_TOO_LARGE = 'That image is larger than 5 MB. Please choose a smaller file.'
export const IMAGE_SAVE_FAILED = 'The image could not be saved. Please try again.'
export const URL_NOT_ALLOWED = 'That link is not allowed. Use a public image link.'
export const URL_REDIRECT = 'That link redirects somewhere else. Use the final image link instead.'
export const URL_FETCH_FAILED = 'We could not download that image. Check the link and try again.'
export const URL_NOT_IMAGE = 'That link is not an image. Use a link that ends in .jpg, .png, .webp or .gif.'
