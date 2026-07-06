// Adds api_mode to ai_provider_configs. For built-in providers this is derived
// from the catalog; for "other" (custom) providers it records the chosen
// compatibility mode ('openai' or 'gemini') used to pick the request adapter.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("ai_provider_configs");

  collection.fields.add(new Field({
    type: "text",
    name: "api_mode",
    max: 20,
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("ai_provider_configs");
  const field = collection.fields.getByName("api_mode");

  if (field) {
    collection.fields.removeById(field.id);
    app.save(collection);
  }
});
