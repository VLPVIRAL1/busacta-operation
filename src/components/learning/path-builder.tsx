import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SinglePersonPicker } from "@/components/shared/single-person-picker";
import { AssignAsTaskButton } from "./assign-as-task-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  trainingPathItemsQuery,
  trainingPathAssignmentsQuery,
  type TrainingPath,
  type TrainingPathItem,
} from "@/lib/queries/learning.queries";
import {
  addPathItem,
  removePathItem,
  reorderPathItems,
  assignPath,
  unassignPath,
} from "@/lib/learning/paths.functions";

interface Course {
  id: string;
  title: string;
  category: string;
  provider: string | null;
  cpe_credits: number | null;
}

interface Props {
  path: TrainingPath;
  allCourses: Course[];
  myCompletedCourseIds?: Set<string>;
}

export function PathBuilder({ path, allCourses, myCompletedCourseIds }: Props) {
  const { role } = useAuth();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);
  const qc = useQueryClient();

  const itemsQ = useQuery(trainingPathItemsQuery(path.id));
  const assignmentsQ = useQuery(trainingPathAssignmentsQuery(path.id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = useMemo(
    () => [...(itemsQ.data ?? [])].sort((a, b) => a.position - b.position),
    [itemsQ.data],
  );

  const addMut = useMutation({
    mutationFn: (courseId: string) =>
      addPathItem({ data: { pathId: path.id, courseId, position: items.length } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-path-items", path.id] });
      toast.success("Course added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removePathItem({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-path-items", path.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderPathItems({ data: { pathId: path.id, orderedIds } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignMut = useMutation({
    mutationFn: (id: string) => unassignPath({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-path-assignments", path.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((s) => s.id === active.id);
    const to = items.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(items, from, to);
    reorderMut.mutate(reordered.map((i) => i.id));
  };

  const usedCourseIds = new Set(items.map((i) => i.course_id));
  const availableCourses = allCourses.filter((c) => !usedCourseIds.has(c.id));

  const completedCount = myCompletedCourseIds
    ? items.filter((i) => myCompletedCourseIds.has(i.course_id)).length
    : 0;
  const progressPct = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const totalCpe = items.reduce((sum, i) => sum + (i.training_courses?.cpe_credits ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Progress (shown to employees) */}
      {myCompletedCourseIds && items.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>
              {completedCount} / {items.length} courses · {progressPct}%
            </span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          {items.length} course{items.length !== 1 ? "s" : ""}
        </span>
        {totalCpe > 0 && <span>{totalCpe} CPE credits</span>}
      </div>

      {/* Course list */}
      {itemsQ.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No courses in this path yet.{isManager ? " Add courses below." : ""}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <SortablePathItemRow
                  key={item.id}
                  item={item}
                  isManager={isManager}
                  isCompleted={myCompletedCourseIds?.has(item.course_id) ?? false}
                  onRemove={() => removeMut.mutate(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {/* Add course (managers only) */}
      {isManager && availableCourses.length > 0 && (
        <AddCourseRow courses={availableCourses} onAdd={(id) => addMut.mutate(id)} />
      )}

      {/* Assign path */}
      {isManager && (
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              Assigned Staff ({(assignmentsQ.data ?? []).length})
            </span>
            <AssignPathDialog pathId={path.id} pathTitle={path.title} />
          </div>
          {assignmentsQ.isLoading ? (
            <Skeleton className="h-10" />
          ) : (
            <div className="space-y-1.5">
              {(assignmentsQ.data ?? []).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <UserAvatar userId={a.employee_id} size="sm" />
                  <span className="flex-1 text-sm">{a.profiles?.full_name ?? a.employee_id}</span>
                  {a.due_date && (
                    <span className="text-xs text-muted-foreground">Due {a.due_date}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => unassignMut.mutate(a.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {(assignmentsQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No staff assigned yet.</p>
              )}
            </div>
          )}
          <AssignAsTaskButton courseTitle={path.title} pathTitle={path.title} variant="outline" />
        </div>
      )}
    </div>
  );
}

function SortablePathItemRow({
  item,
  isManager,
  isCompleted,
  onRemove,
}: {
  item: TrainingPathItem;
  isManager: boolean;
  isCompleted: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm ${isDragging ? "opacity-50" : ""}`}
    >
      {isManager && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
          {item.training_courses?.title ?? "Unknown"}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground capitalize">
            {(item.training_courses?.category ?? "").replace("_", " ")}
          </span>
          {item.training_courses?.cpe_credits && (
            <Badge variant="secondary" className="text-[10px]">
              {item.training_courses.cpe_credits} CPE
            </Badge>
          )}
        </div>
      </div>
      {isCompleted && (
        <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shrink-0">
          Done
        </Badge>
      )}
      {isManager && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}

function AddCourseRow({ courses, onAdd }: { courses: Course[]; onAdd: (id: string) => void }) {
  const [selected, setSelected] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 text-sm flex-1">
          <SelectValue placeholder="Add a course…" />
        </SelectTrigger>
        <SelectContent>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 gap-1.5"
        disabled={!selected}
        onClick={() => {
          onAdd(selected);
          setSelected("");
        }}
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

function AssignPathDialog({ pathId, pathTitle }: { pathId: string; pathTitle: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  const mut = useMutation({
    mutationFn: () => {
      if (!employeeId) throw new Error("Select a staff member");
      return assignPath({ data: { pathId, employeeIds: [employeeId], dueDate: dueDate || null } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-path-assignments", pathId] });
      toast.success("Path assigned");
      setOpen(false);
      setEmployeeId(null);
      setDueDate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
          <Plus className="h-3 w-3" /> Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Path</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Assign <span className="font-medium text-foreground">{pathTitle}</span> to a staff
            member.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Staff member</Label>
            <SinglePersonPicker value={employeeId} onChange={setEmployeeId} placeholder="Select…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due date (optional)</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!employeeId || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
