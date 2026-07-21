// Feedback tickets: extends office_feedback additively so the same collection
// stores both legacy rating records (kept readable) and the new ticket-style
// feedback. Tickets can target unsaved generation results, so the previously
// required office_output relation becomes optional and the legacy score fields
// drop their min so ticket rows without scores validate.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("office_feedback");

  const officeOutput = collection.fields.getByName("office_output");
  if (officeOutput) {
    officeOutput.required = false;
  }

  for (const name of ["accuracy_score", "copyability_score", "completeness_score"]) {
    const field = collection.fields.getByName(name);
    if (field) {
      field.min = null;
    }
  }

  const textFields = [
    ["target_type", 40],
    ["target_id", 60],
    ["issue_type", 60],
    ["subject", 200],
    ["details", 6000],
    ["expected_result", 3000],
    ["impact", 30],
    ["status", 30],
  ];

  for (const [name, max] of textFields) {
    if (!collection.fields.getByName(name)) {
      collection.fields.add(new Field({
        type: "text",
        name,
        max,
      }));
    }
  }

  if (!collection.fields.getByName("triage")) {
    collection.fields.add(new Field({
      type: "json",
      name: "triage",
    }));
  }

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("office_feedback");

  for (const name of [
    "target_type",
    "target_id",
    "issue_type",
    "subject",
    "details",
    "expected_result",
    "impact",
    "status",
    "triage",
  ]) {
    const field = collection.fields.getByName(name);
    if (field) {
      collection.fields.removeById(field.id);
    }
  }

  const officeOutput = collection.fields.getByName("office_output");
  if (officeOutput) {
    officeOutput.required = true;
  }

  for (const name of ["accuracy_score", "copyability_score", "completeness_score"]) {
    const field = collection.fields.getByName(name);
    if (field) {
      field.min = 1;
    }
  }

  app.save(collection);
});
