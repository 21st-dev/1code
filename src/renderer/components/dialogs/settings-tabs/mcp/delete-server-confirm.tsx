import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "../../../ui/alert-dialog"
import { useI18n } from "../../../../lib/i18n"

interface DeleteServerConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverName: string
  onConfirm: () => void
  isDeleting?: boolean
}

export function DeleteServerConfirm({
  open,
  onOpenChange,
  serverName,
  onConfirm,
  isDeleting = false,
}: DeleteServerConfirmProps) {
  const { t } = useI18n()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.mcp.deleteMcpServer")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings.mcp.deleteConfirmPrefix")}{" "}
            <strong>{serverName}</strong>?{" "}
            {t("settings.mcp.deleteConfirmSuffix")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? t("common.deleting") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
