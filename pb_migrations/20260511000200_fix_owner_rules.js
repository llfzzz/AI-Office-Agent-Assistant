migrate((app) => {
  const ownRecordsRule = "@request.auth.id != \"\" && user.id = @request.auth.id";
  const ownCreateRule = "@request.auth.id != \"\" && @request.body.user = @request.auth.id";

  for (const name of ["meetings", "knowledge_documents", "qa_entries"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.listRule = ownRecordsRule;
    collection.viewRule = ownRecordsRule;
    collection.createRule = ownCreateRule;
    collection.updateRule = ownRecordsRule;
    collection.deleteRule = ownRecordsRule;
    app.save(collection);
  }
}, (app) => {
  const oldOwnRecordsRule = "@request.auth.id != \"\" && user = @request.auth.id";
  const ownCreateRule = "@request.auth.id != \"\" && @request.body.user = @request.auth.id";

  for (const name of ["meetings", "knowledge_documents", "qa_entries"]) {
    const collection = app.findCollectionByNameOrId(name);
    collection.listRule = oldOwnRecordsRule;
    collection.viewRule = oldOwnRecordsRule;
    collection.createRule = ownCreateRule;
    collection.updateRule = oldOwnRecordsRule;
    collection.deleteRule = oldOwnRecordsRule;
    app.save(collection);
  }
});
