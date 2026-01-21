export {
	GitWatcher,
	gitWatcherRegistry,
	type FileChange,
	type FileChangeType,
	type GitWatchEvent,
} from "./git-watcher";

export {
	registerGitWatcherIPC,
	cleanupGitWatchers,
} from "./ipc-bridge";
