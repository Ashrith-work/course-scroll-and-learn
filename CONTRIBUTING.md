# Contributing

`main` is protected: changes land via pull requests, and CI must pass before
merging. Direct pushes to `main` are blocked.

## Workflow

1. **Branch off `main`:**

   ```bash
   git switch main
   git pull
   git switch -c my-change
   ```

2. **Make your change**, then run the tests locally:

   ```bash
   npm test
   ```

3. **Commit and push:**

   ```bash
   git add -A
   git commit -m "Describe the change"
   git push -u origin my-change
   ```

4. **Open a pull request:**

   ```bash
   gh pr create --fill
   ```

5. **Wait for CI.** The `test (20.x)` and `test (22.x)` jobs are required and
   run against Node 20 and 22. The branch must also be up to date with `main`
   (strict mode) before it can merge.

6. **Merge** once checks are green (no approval is required for a solo repo):

   ```bash
   gh pr merge --squash --delete-branch
   ```

## Conventions

- Keep the test suite green; add tests for new behavior (`tests/api.test.js`).
- Input validation lives in `middleware/validate.js` — extend the per-route
  schemas rather than adding ad-hoc checks in handlers.
- Data access goes through the repository layer in `data/store.js`.
