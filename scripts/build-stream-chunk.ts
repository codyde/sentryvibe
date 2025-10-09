import { createBuildStream } from '../apps/sentryvibe/src/lib/build/engine';

(async () => {
  const stream = await createBuildStream({
    projectId: 'test',
    operationType: 'initial-build',
    prompt: 'hello world',
    context: {},
    query: () => (async function*() {})(),
  });

  const reader = stream.getReader();
  const { value } = await reader.read();
  console.log('chunk type', typeof value, value?.constructor?.name);
})();
