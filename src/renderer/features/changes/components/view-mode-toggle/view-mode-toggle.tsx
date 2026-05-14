import { Button } from "../../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { LuFolder, LuFolderTree } from "react-icons/lu";
import type { ChangesViewMode } from "../../types";
import { useI18n } from "../../../../lib/i18n";

interface ViewModeToggleProps {
	viewMode: ChangesViewMode;
	onViewModeChange: (mode: ChangesViewMode) => void;
}

export function ViewModeToggle({
	viewMode,
	onViewModeChange,
}: ViewModeToggleProps) {
	const { t } = useI18n();
	const handleToggle = () => {
		onViewModeChange(viewMode === "grouped" ? "tree" : "grouped");
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleToggle}
					className="size-6 p-0"
					aria-label={viewMode === "grouped" ? t("changes.view.groupedView") : t("changes.view.treeView")}
				>
					{viewMode === "grouped" ? (
						<LuFolder className="size-3.5" />
					) : (
						<LuFolderTree className="size-3.5" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				{viewMode === "grouped"
					? t("changes.view.switchToTree")
					: t("changes.view.switchToGrouped")}
			</TooltipContent>
		</Tooltip>
	);
}
