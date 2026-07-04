migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const ownRecordsRule = "@request.auth.id != \"\" && user.id = @request.auth.id";
  const ownCreateRule = "@request.auth.id != \"\" && @request.body.user = @request.auth.id";

  // Per-user AI provider configurations. API keys are stored ONLY as an
  // AES-256-GCM ciphertext in api_key_cipher (encrypted by the server before
  // save); the plaintext key is never persisted and never returned to clients.
  // api_key_hint holds a masked display value (e.g. sk-****abcd).
  const aiConfigs = new Collection({
    type: "base",
    name: "ai_provider_configs",
    listRule: ownRecordsRule,
    viewRule: ownRecordsRule,
    createRule: ownCreateRule,
    updateRule: ownRecordsRule,
    deleteRule: ownRecordsRule,
    fields: [
      {
        type: "relation",
        name: "user",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: "text",
        name: "label",
        required: true,
        max: 80,
      },
      {
        type: "text",
        name: "provider",
        max: 40,
      },
      {
        type: "text",
        name: "base_url",
        max: 400,
      },
      {
        type: "text",
        name: "model",
        max: 160,
      },
      {
        // AES-256-GCM ciphertext (v1:iv:tag:data, base64). Never exposed to clients.
        type: "text",
        name: "api_key_cipher",
        max: 4000,
      },
      {
        // Masked display value only (no secret material), e.g. sk-****abcd.
        type: "text",
        name: "api_key_hint",
        max: 60,
      },
      {
        type: "bool",
        name: "is_default",
      },
      {
        type: "text",
        name: "last_validation_status",
        max: 20,
      },
      {
        type: "text",
        name: "last_validation_message",
        max: 400,
      },
      {
        type: "text",
        name: "last_validated_at",
        max: 40,
      },
      {
        type: "autodate",
        name: "created",
        onCreate: true,
      },
      {
        type: "autodate",
        name: "updated",
        onCreate: true,
        onUpdate: true,
      },
    ],
  });
  app.save(aiConfigs);

  // Append-only audit trail for sensitive AI-config actions. Users can read
  // their own entries; no update/delete rule means entries are immutable via API.
  // Secret values are never written here.
  const aiConfigAudit = new Collection({
    type: "base",
    name: "ai_config_audit",
    listRule: ownRecordsRule,
    viewRule: ownRecordsRule,
    createRule: ownCreateRule,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        type: "relation",
        name: "user",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: "text",
        name: "action",
        required: true,
        max: 30,
      },
      {
        type: "text",
        name: "config_id",
        max: 40,
      },
      {
        type: "text",
        name: "config_label",
        max: 160,
      },
      {
        type: "text",
        name: "detail",
        max: 400,
      },
      {
        type: "autodate",
        name: "created",
        onCreate: true,
      },
    ],
  });
  app.save(aiConfigAudit);
}, (app) => {
  for (const name of ["ai_config_audit", "ai_provider_configs"]) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch {
      // Already removed.
    }
  }
});
