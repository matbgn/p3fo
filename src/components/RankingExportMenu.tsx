import * as React from "react";
import { useTranslation } from "react-i18next";
import { Copy, Download, FileJson, FileSpreadsheet, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  buildPlainRankingList,
  buildRankedList,
  buildRankingCsv,
  buildRankingJson,
  copyToClipboard,
  downloadTextFile,
  type RankingExportItem,
} from "@/lib/ranking-export";

interface RankingExportMenuProps {
  items: RankingExportItem[];
  filename?: string;
  className?: string;
}

export const RankingExportMenu: React.FC<RankingExportMenuProps> = ({
  items,
  filename = "ranking",
  className,
}) => {
  const { t: tt } = useTranslation();
  const { toast } = useToast();

  const handleCopy = async (content: string, label: string) => {
    const copied = await copyToClipboard(content);
    if (copied) {
      toast({ title: tt("rankingExport.copied"), description: label });
    } else {
      toast({
        title: tt("rankingExport.copyFailed"),
        description: label,
        variant: "destructive",
      });
    }
  };

  const handleDownload = (content: string, extension: string, mime: string, label: string) => {
    downloadTextFile(`${filename}.${extension}`, content, mime);
    toast({ title: tt("rankingExport.downloaded"), description: label });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={items.length === 0}
          className={className}
        >
          <Download className="w-4 h-4 mr-1" />
          {tt("rankingExport.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void handleCopy(buildPlainRankingList(items), tt("rankingExport.copyPlain"))}>
          <ListOrdered className="w-4 h-4 mr-2" />
          {tt("rankingExport.copyPlain")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleCopy(buildRankedList(items), tt("rankingExport.copyRanked"))}>
          <Copy className="w-4 h-4 mr-2" />
          {tt("rankingExport.copyRanked")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            handleDownload(
              buildRankingCsv(items),
              "csv",
              "text/csv;charset=utf-8",
              tt("rankingExport.downloadCsv"),
            )
          }
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          {tt("rankingExport.downloadCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            handleDownload(
              buildRankingJson(items),
              "json",
              "application/json",
              tt("rankingExport.downloadJson"),
            )
          }
        >
          <FileJson className="w-4 h-4 mr-2" />
          {tt("rankingExport.downloadJson")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
