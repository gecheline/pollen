// The vocab-map scatter's own explanation — what the cloud of points
// actually is. Originally gallery-only copy (living in CardView.tsx); the
// local app never got an info button on its own map at all, which reads
// as one of the very few things you can't get an explanation for
// mid-conversation. Shared here so both apps render the identical text
// rather than risking two copies drifting apart.
export const SCATTER_INFO_TEXT =
  "This is a 2D view of the model's embedding space. Embeddings are vector — numeric — representations of words, and this shows the model's whole internal vocabulary as a cloud. It's been squished from many dimensions down to two so it can be drawn at all, so keep in mind the real thing is far more complex than the map can show."
