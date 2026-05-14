import { Button } from "../../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { ChevronUp } from "lucide-react";
import { IconSpinner } from "../../../../components/ui/icons";
import { cn } from "../../../../lib/utils";
import { useI18n } from "../../../../lib/i18n";

interface CollapsedCommitBarProps {
	fileCount: number;
	stagedCount: number;
	currentBranch?: string;
	onToggle: () => void;
	onCommit: () => void;
	isCommitting?: boolean;
}

export function CollapsedCommitBar({
	fileCount,
	stagedCount,
	currentBranch,
	onToggle,
	onCommit,
	isCommitting = false,
}: CollapsedCommitBarProps) {
	const { t } = useI18n();
	const canCommit = stagedCount > 0;

	const getCommitLabel = () => {
		if (stagedCount > 0 && currentBranch) {
			return t("changes.commit.commitCountToBranch", {
				count: stagedCount,
				branch: currentBranch,
			});
		}
		if (currentBranch) {
			return t("changes.commit.commitToBranch", { branch: currentBranch });
		}
		return t("changes.commit.commit");
	};

	const getTooltip = () => {
		if (stagedCount === 0) return t("changes.commit.noStagedChanges");
		if (isCommitting) return t("changes.commit.aiGenerating");
		return t("changes.commit.commitStagedWithAI");
	};

	return (
		<div className="flex flex-col border-t border-border/50 bg-background flex-shrink-0">
			{/* Header trigger row - click to expand/collapse */}
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex items-center gap-2 px-2 py-1.5 w-full",
					"hover:bg-muted/50 transition-colors",
					"text-left"
				)}
			>
				<ChevronUp className="size-3.5 text-muted-foreground flex-shrink-0" />
				<span className="text-xs font-medium">{t("changes.title")}</span>
				<span className="text-xs text-muted-foreground">
					({fileCount} {fileCount === 1 ? t("changes.filter.file") : t("changes.filter.files")})
				</span>
			</button>

			{/* Full-width Commit button */}
			<div className="px-2 pb-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="default"
							size="sm"
							className="w-full h-7 text-xs gap-1.5"
							onClick={onCommit}
							disabled={!canCommit || isCommitting}
						>
							{isCommitting && <IconSpinner className="size-3.5" />}
							{getCommitLabel()}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="top">{getTooltip()}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
