import { Search, Filter, Layers, FileText } from "lucide-react";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { DISCIPLINES, translateDiscipline } from "../../../constants/disciplines";

export function FormsTabsToolbar({
  embedded,
  t,
  searchQuery,
  setSearchQuery,
  disciplineFilter,
  setDisciplineFilter,
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <TabsList>
        <TabsTrigger value="templates" data-testid="templates-tab">
          <Layers className="w-4 h-4 mr-2" /> {t("forms.templates")}
        </TabsTrigger>
        {!embedded && (
          <TabsTrigger value="submissions" data-testid="submissions-tab">
            <FileText className="w-4 h-4 mr-2" /> {t("forms.submissions")}
          </TabsTrigger>
        )}
      </TabsList>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={t("forms.searchTemplates")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="search-input"
          />
        </div>
        <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
          <SelectTrigger className="w-[160px]" title={t("forms.filterByDiscipline")}>
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder={t("forms.discipline")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("forms.allDisciplines")}</SelectItem>
            {DISCIPLINES.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {translateDiscipline(t, d.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
