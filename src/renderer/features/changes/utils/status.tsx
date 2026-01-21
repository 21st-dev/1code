import type { ReactNode } from "react";
import type { FileStatus } from "../../../../shared/changes-types";

/**
 * Git status icon - Add (green square with plus)
 */
function IconStatusAdd({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M16.2426 12H7.75736M12 16.2426V7.75732"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/**
 * Git status icon - Delete (red square with minus)
 */
function IconStatusDelete({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M16.2426 12H7.75736"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/**
 * Git status icon - Edit/Modified (yellow square with dot)
 */
function IconStatusEdit({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<path
				d="M18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12Z"
				fill="currentColor"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/**
 * Get text color for status
 */
export function getStatusColor(status: FileStatus): string {
	switch (status) {
		case "added":
		case "untracked":
			return "text-green-500";
		case "modified":
			return "text-yellow-500";
		case "deleted":
			return "text-red-500";
		case "renamed":
			return "text-blue-500";
		case "copied":
			return "text-purple-500";
		default:
			return "text-muted-foreground";
	}
}

/**
 * Git status indicator with appropriate icon and color
 */
export function getStatusIndicator(status: FileStatus): ReactNode {
	const color = getStatusColor(status);

	switch (status) {
		case "added":
		case "untracked":
			return <IconStatusAdd className={color} />;
		case "modified":
			return <IconStatusEdit className={color} />;
		case "deleted":
			return <IconStatusDelete className={color} />;
		case "renamed":
			return <IconStatusEdit className={`${color}`} />;
		case "copied":
			return <IconStatusAdd className={color} />;
		default:
			return <IconStatusEdit className={color} />;
	}
}
