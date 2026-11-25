const {pauseMarkers} = require('./hooks');

async function registerPushErrors(context, vscode) {
  const extension = vscode.extensions.getExtension('vscode.git');
  if (!extension) return;
  let git;
  try {
    git = await extension.activate();
  } catch (error) {
    console.warn('Push for Peace could not activate the VS Code Git integration.', error);
    return;
  }

  const handler = {
    async handlePushError(_repository, _remote, _refspec, error) {
      if (error?.gitErrorCode !== 'PushRejected' || typeof error.stderr !== 'string') return false;
      for (const line of error.stderr.split(/\r?\n/)) {
        if (line.startsWith(pauseMarkers.unavailable + ' ')) {
          // Release the Git operation immediately, even if the user leaves the notification open.
          vscode.window.showWarningMessage('Push paused. Push for Peace needs fresh readings.', 'Refresh Readings')
            .then(choice => {
              if (choice === 'Refresh Readings') return vscode.commands.executeCommand('pushForPeace.refresh');
            }).catch(error => console.warn('Push for Peace could not refresh readings.', error));
          return true;
        }
        if (line.startsWith(pauseMarkers.outside + ' ')) {
          vscode.window.showWarningMessage(line.slice(pauseMarkers.outside.length + 1));
          return true;
        }
      }
      return false;
    }
  };
  let registration;
  function syncRegistration() {
    registration?.dispose();
    registration = git.enabled ? git.getAPI(1).registerPushErrorHandler(handler) : undefined;
  }
  context.subscriptions.push(git.onDidChangeEnablement(syncRegistration),
    {dispose: () => registration?.dispose()});
  syncRegistration();
}

module.exports = {registerPushErrors};
