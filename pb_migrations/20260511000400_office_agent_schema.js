migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const ownRecordsRule = "@request.auth.id != \"\" && user.id = @request.auth.id";
  const ownCreateRule = "@request.auth.id != \"\" && @request.body.user = @request.auth.id";

  const officeOutputs = new Collection({
    type: "base",
    name: "office_outputs",
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
        name: "skill_id",
        required: true,
        max: 80,
      },
      {
        type: "text",
        name: "title",
        required: true,
        max: 240,
      },
      {
        type: "json",
        name: "input",
        required: true,
      },
      {
        type: "json",
        name: "agent_plan",
        required: true,
      },
      {
        type: "json",
        name: "output",
        required: true,
      },
      {
        type: "json",
        name: "quality_check",
      },
      {
        type: "json",
        name: "rag",
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
  app.save(officeOutputs);

  const officeFeedback = new Collection({
    type: "base",
    name: "office_feedback",
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
        name: "office_output",
        required: true,
        collectionId: officeOutputs.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: "text",
        name: "skill_id",
        max: 80,
      },
      {
        type: "text",
        name: "output_title",
        max: 240,
      },
      {
        type: "number",
        name: "accuracy_score",
        min: 1,
        max: 5,
      },
      {
        type: "number",
        name: "copyability_score",
        min: 1,
        max: 5,
      },
      {
        type: "number",
        name: "completeness_score",
        min: 1,
        max: 5,
      },
      {
        type: "bool",
        name: "needs_heavy_edit",
      },
      {
        type: "text",
        name: "missing_info",
      },
      {
        type: "text",
        name: "hallucination",
      },
      {
        type: "text",
        name: "suggestion",
      },
      {
        type: "json",
        name: "feedback_summary",
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
  app.save(officeFeedback);
}, (app) => {
  for (const name of ["office_feedback", "office_outputs"]) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch {
      // Already removed.
    }
  }
});
