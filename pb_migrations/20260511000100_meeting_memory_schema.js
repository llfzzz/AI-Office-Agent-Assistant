migrate((app) => {
  let users;

  try {
    users = app.findCollectionByNameOrId("users");
  } catch {
    users = new Collection({
      type: "auth",
      name: "users",
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      createRule: "",
      updateRule: "id = @request.auth.id",
      deleteRule: "id = @request.auth.id",
      fields: [
        {
          type: "text",
          name: "name",
          max: 120,
        },
      ],
      passwordAuth: {
        enabled: true,
      },
    });
    app.save(users);
    users = app.findCollectionByNameOrId("users");
  }

  const ownRecordsRule = "@request.auth.id != \"\" && user = @request.auth.id";
  const ownCreateRule = "@request.auth.id != \"\" && @request.body.user = @request.auth.id";

  const meetings = new Collection({
    type: "base",
    name: "meetings",
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
        name: "title",
        required: true,
        max: 240,
      },
      {
        type: "text",
        name: "date",
        max: 40,
      },
      {
        type: "text",
        name: "meeting_type",
        max: 80,
      },
      {
        type: "text",
        name: "participants",
        max: 500,
      },
      {
        type: "text",
        name: "raw_transcript",
      },
      {
        type: "json",
        name: "analysis",
        required: true,
      },
      {
        type: "json",
        name: "qa_history",
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
  app.save(meetings);

  const knowledgeDocuments = new Collection({
    type: "base",
    name: "knowledge_documents",
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
        name: "title",
        required: true,
        max: 180,
      },
      {
        type: "text",
        name: "content",
        required: true,
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
  app.save(knowledgeDocuments);

  const qaEntries = new Collection({
    type: "base",
    name: "qa_entries",
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
        type: "relation",
        name: "meeting",
        required: true,
        collectionId: meetings.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: "text",
        name: "question",
        required: true,
      },
      {
        type: "text",
        name: "answer",
        required: true,
      },
      {
        type: "text",
        name: "evidence",
      },
      {
        type: "text",
        name: "confidence",
        max: 40,
      },
      {
        type: "text",
        name: "source",
        max: 80,
      },
      {
        type: "json",
        name: "warnings",
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
  app.save(qaEntries);
}, (app) => {
  for (const name of ["qa_entries", "knowledge_documents", "meetings"]) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch {
      // Already removed.
    }
  }
});
