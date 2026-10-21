- [ ] Create `LocalProjectRepository` that implements `ProjectRepository`. Each supporting service, such as test,
      document, etc. should do CRUD via `ProjectRepository` API.
- [ ] Create `ProjectRepository` should be able to list all available projects. Also, it should have an api to create
      the new project from EdgeRUles DSL as well as EdgeRules portable. `ProjectRepository` should be used in Storybook
      to simplify creation of session.
- [ ] Ensure that `ProjectSession` owns `MutableDecisionService` wrapped into `ProjectEngine`.
- [ ] Storybook stories should be initialized from `ProjectSessionManager` - this manager should create a
      `ProjectSession`. `ProjectSessionManager` per default should initialize `LocalProjectRepository` so it will search
      for a project in a IndexedDb when asked. API would be `findAndLoad(modelName)`
- [ ] Develop `ProjectFactory` that should have an api `crateDraftSession` that accepts EdgeRules code and might accept
      other data such as document store comments, or test store cache or other metadata for React Flow. You will need to
      design it. `crateDraftSession` creates project and persists to `LocalProjectRepository`.
