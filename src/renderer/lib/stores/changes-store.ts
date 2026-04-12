import type {
	ChangeCategory,
	ChangedFile,
	DiffViewMode,
} from "../../../shared/changes-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { getWindowId } from "../../contexts/WindowContext";

type FileListViewMode = "grouped" | "tree";

interface SelectedFileState {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash: string | null;
}

interface ChangesState {
	selectedFiles: Record<string, SelectedFileState | null>;
	viewMode: DiffViewMode;
	fileListViewMode: FileListViewMode;
	expandedSections: Record<ChangeCategory, boolean>;
	baseBranch: string | null;
	showRenderedMarkdown: Record<string, boolean>;

	selectFile: (
		worktreePath: string,
		file: ChangedFile | null,
		category?: ChangeCategory,
		commitHash?: string | null,
	) => void;
	getSelectedFile: (worktreePath: string) => SelectedFileState | null;
	setViewMode: (mode: DiffViewMode) => void;
	setFileListViewMode: (mode: FileListViewMode) => void;
	toggleSection: (section: ChangeCategory) => void;
	setSectionExpanded: (section: ChangeCategory, expanded: boolean) => void;
	setBaseBranch: (branch: string | null) => void;
	toggleRenderedMarkdown: (worktreePath: string) => void;
	getShowRenderedMarkdown: (worktreePath: string) => boolean;
	reset: (worktreePath: string) => void;
}

const initialState = {
	selectedFiles: {} as Record<string, SelectedFileState | null>,
	viewMode: "side-by-side" as DiffViewMode,
	fileListViewMode: "grouped" as FileListViewMode,
	expandedSections: {
		"against-base": true,
		committed: true,
		staged: true,
		unstaged: true,
	},
	baseBranch: null,
	showRenderedMarkdown: {} as Record<string, boolean>,
};

export const useChangesStore = create<ChangesState>()(
	devtools(
		persist(
			(set, get) => ({
				...initialState,

				selectFile: (worktreePath, file, category, commitHash) => {
					const { selectedFiles } = get();
					set({
						selectedFiles: {
							...selectedFiles,
							[worktreePath]: file
								? {
										file,
										category: category ?? "against-base",
										commitHash: commitHash ?? null,
									}
								: null,
						},
					});
				},

				getSelectedFile: (worktreePath) => {
					return get().selectedFiles[worktreePath] ?? null;
				},

				setViewMode: (mode) => {
					set({ viewMode: mode });
				},

				setFileListViewMode: (mode) => {
					set({ fileListViewMode: mode });
				},

				toggleSection: (section) => {
					const { expandedSections } = get();
					set({
						expandedSections: {
							...expandedSections,
							[section]: !expandedSections[section],
						},
					});
				},

				setSectionExpanded: (section, expanded) => {
					const { expandedSections } = get();
					set({
						expandedSections: {
							...expandedSections,
							[section]: expanded,
						},
					});
				},

				setBaseBranch: (branch) => {
					set({ baseBranch: branch });
				},

				toggleRenderedMarkdown: (worktreePath) => {
					const { showRenderedMarkdown } = get();
					set({
						showRenderedMarkdown: {
							...showRenderedMarkdown,
							[worktreePath]: !showRenderedMarkdown[worktreePath],
						},
					});
				},

				getShowRenderedMarkdown: (worktreePath) => {
					return get().showRenderedMarkdown[worktreePath] ?? false;
				},

				reset: (worktreePath) => {
					const { selectedFiles } = get();
					set({
						selectedFiles: {
							...selectedFiles,
							[worktreePath]: null,
						},
					});
				},
			}),
			{
				name: `${getWindowId()}:changes-store`,
				partialize: (state) => ({
					selectedFiles: state.selectedFiles,
					viewMode: state.viewMode,
					fileListViewMode: state.fileListViewMode,
					expandedSections: state.expandedSections,
					baseBranch: state.baseBranch,
					showRenderedMarkdown: state.showRenderedMarkdown,
				}),
				// Migrate from legacy storage key if window-scoped key doesn't exist
				onRehydrateStorage: () => {
					const windowKey = `${getWindowId()}:changes-store`
					const legacyKey = "changes-store"

					// Skip if already have data for this window
					if (localStorage.getItem(windowKey)) {
						return undefined
					}

					// Migration 1: Check for old numeric window ID keys (e.g., "1:changes-store")
					// Only migrate for "main" window
					if (windowKey.startsWith("main:")) {
						for (let i = 0; i < localStorage.length; i++) {
							const storageKey = localStorage.key(i)
							if (!storageKey) continue

							const match = storageKey.match(/^(\d+):changes-store$/)
							if (match) {
								const numericData = localStorage.getItem(storageKey)
								if (numericData) {
									localStorage.setItem(windowKey, numericData)
									return undefined
								}
							}
						}
					}

					// Migration 2: Check legacy key (without window prefix)
					if (localStorage.getItem(legacyKey)) {
						const legacyData = localStorage.getItem(legacyKey)
						if (legacyData) {
							localStorage.setItem(windowKey, legacyData)
						}
					}

					return undefined
				},
			},
		),
		{ name: "ChangesStore" },
	),
);
