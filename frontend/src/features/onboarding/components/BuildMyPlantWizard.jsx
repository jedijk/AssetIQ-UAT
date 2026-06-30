import {
  Wrench,
  FileSpreadsheet,
  Image,
  Package,
  Plug,
  Map,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { ENTRY_PATH_CARDS } from "../config/phases";

const ICONS = {
  equipment: Wrench,
  pm: FileSpreadsheet,
  pid: Image,
  spares: Package,
  api: Plug,
  scratch: Map,
};

const LABELS = {
  equipment_list: {
    title: "I have an Equipment List",
    description: "Start with Excel or AI equipment import.",
  },
  pm_procedures: {
    title: "I have PM Procedures",
    description: "Import your PM plan into the failure mode library.",
  },
  pid_drawings: {
    title: "I have P&IDs or Drawings",
    description: "Use AI Process Import to build hierarchy from diagrams.",
  },
  spare_parts: {
    title: "I have Spare Parts",
    description: "Link spare parts to equipment in SpareIQ.",
  },
  integrations: {
    title: "I need Integrations",
    description: "Configure External API keys for system connections.",
  },
  from_scratch: {
    title: "Start From Scratch",
    description: "Walk through the complete guided onboarding.",
  },
};

export function BuildMyPlantWizard({ options, onSelect, isLoading }) {
  const cards = ENTRY_PATH_CARDS.map((card) => ({
    ...card,
    ...(options?.[card.id] || {}),
    ...(LABELS[card.id] || {}),
  }));

  return (
    <div className="space-y-6">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-900">
          How would you like to build your AssetIQ environment?
        </h2>
        <p className="text-slate-500 mt-2">Choose a starting point — you can complete every phase later.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = ICONS[card.icon] || Wrench;
          return (
            <Card
              key={card.id}
              className="cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all"
              onClick={() => !isLoading && onSelect(card.id)}
            >
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5 text-emerald-700" />
                </div>
                <CardTitle className="text-lg">{card.title || card.label}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" disabled={isLoading}>
                  Select
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
