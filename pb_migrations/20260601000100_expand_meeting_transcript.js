migrate((app) => {
  const meetings = app.findCollectionByNameOrId("meetings");
  const rawTranscript = meetings.fields.getByName("raw_transcript");

  rawTranscript.max = 2000000;
  app.save(meetings);
}, (app) => {
  const meetings = app.findCollectionByNameOrId("meetings");
  const rawTranscript = meetings.fields.getByName("raw_transcript");

  rawTranscript.max = 0;
  app.save(meetings);
});
