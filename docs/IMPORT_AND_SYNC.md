# Recipe import and sync recovery

JSON import extracts one recipe, repairs common syntax mistakes with `jsonrepair`, normalizes clear type variations and selected field aliases, and validates the result. The review screen lists changes and omitted extra fields. Ambiguous numbers, conflicting aliases, multiple recipes, unsupported versions, truncated values, and limits still produce field-specific errors. Imported recipe text remains plain text. API validation and image URL security remain strict.

Recipes and their durable outbox entries save in one IndexedDB transaction. New local images no longer block recipe text from reaching the server: the first recipe write omits an unavailable cover, and a separate version-checked cover update attaches it after upload. The local recipe retains its cover while waiting. Existing unsent image-dependent writes are upgraded during sync. Requests that may have reached the server keep their original operation ID and payload; later edits are queued separately.

Tap the sync indicator or **Visa fel och åtgärder** to see failed actions, affected recipes, field errors, HTTP status, error code, and request ID where available. Retry explicitly retries the selected failed operation, including failures excluded from automatic retries. Recipes can be edited, images replaced, or **Fortsätt utan bild** selected. Old failures retain whatever diagnostics were originally stored; retry captures the current response.

The UI distinguishes a committed local save from server sync. Storage read failures have a visible error, and recipe detail reads its record directly instead of relying only on the library subscription having updated after navigation.

Rejected weekly-plan changes can be repaired directly in the sync dialog, including entries hidden by an invalid or empty date. Choose a valid date and **Spara datum och synka**, or use **Ta bort planeringen** to queue a valid deletion for that meal alone. The recipe is retained. Invalid dates are rejected before new local planning writes; clearing the planner's date input no longer queues an empty date.

File and URL imports share one local image preparation pipeline. Native decoding is attempted first, with a lazy HEIC decoder when needed. JPEG covers and thumbnails are prepared once and uploaded together. Other devices download either stored variant without conversion. Failed downloads show an image error and can be retried from the detail view; network reconnection also retries visible images.

Regression coverage uses synthetic recipe data and includes syntax/type recovery, invalid URLs, JPEG preparation, independent variant caching, interrupted image pairs, image rejection, temporary failures, explicit retry, cover removal, text edits during a failed upload, lost acknowledgements, durable reopening, and structured Worker validation errors. Run `npm test` and `npm run build`.
