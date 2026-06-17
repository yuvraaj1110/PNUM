/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras — Fleet Tool Catalog (single source of truth for tool contracts)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  One declarative list of tools, each with a JSON-Schema input contract.
 *  Consumed by BOTH:
 *     • the MCP server     → registers each as an MCP tool
 *     • the copilot route  → passes each to Anthropic as a tool definition
 *
 *  `executeTool` is the shared dispatcher that runs a tool by name against
 *  the fleet-ops core. Keeping the catalog + dispatcher here guarantees the
 *  MCP surface and the copilot surface never drift apart.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getFleetStatus,
  listJobs,
  findNearestAvailableTech,
  assignJob,
  getJobHistory,
} from './fleet-ops';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export const FLEET_TOOLS: ToolDef[] = [
  {
    name: 'get_fleet_status',
    description:
      'List all technicians with their current status (active/busy/offline), specialty, GPS location, and how many jobs they are currently assigned.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_jobs',
    description:
      'List service jobs, optionally filtered by status and/or priority. Returns newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'assigned', 'in_progress', 'completed'],
          description: 'Filter by job status.',
        },
        priority: {
          type: 'string',
          enum: ['emergency', 'high', 'medium', 'low'],
          description: 'Filter by urgency.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'find_nearest_available_tech',
    description:
      'Rank the best active technicians for a given job using the assignment algorithm (distance + load + skill match + availability, weighted by job priority). Returns ranked candidates with scores and a breakdown. Does NOT assign.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'UUID of the job to staff.' },
        top_n: { type: 'integer', minimum: 1, maximum: 10, description: 'How many candidates to return (default 3).' },
      },
      required: ['job_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'assign_job',
    description:
      'Assign a technician to a job. SIDE EFFECTS: writes an assignment row (with the computed score), sets the job to "assigned", marks the technician "busy", and appends a job_events audit row. Confirm with the dispatcher before calling.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'UUID of the job.' },
        technician_id: { type: 'string', description: 'UUID of the technician to assign.' },
        assigned_by: { type: 'string', description: 'Who initiated it: dispatcher | copilot | mcp.' },
      },
      required: ['job_id', 'technician_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_job_history',
    description:
      'Get past jobs for a technician (by technician_id) or a customer (by customer_id).',
    inputSchema: {
      type: 'object',
      properties: {
        technician_id: { type: 'string' },
        customer_id: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
];

/** Run a tool by name against the fleet-ops core. Returns a JSON-serializable result. */
export async function executeTool(
  sb: SupabaseClient,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_fleet_status':
      return getFleetStatus(sb);
    case 'list_jobs':
      return listJobs(sb, { status: args.status as string, priority: args.priority as string });
    case 'find_nearest_available_tech':
      return findNearestAvailableTech(sb, args.job_id as string, (args.top_n as number) ?? 3);
    case 'assign_job':
      return assignJob(sb, {
        jobId: args.job_id as string,
        technicianId: args.technician_id as string,
        assignedBy: (args.assigned_by as string) ?? 'copilot',
      });
    case 'get_job_history':
      return getJobHistory(sb, {
        technicianId: args.technician_id as string | undefined,
        customerId: args.customer_id as string | undefined,
        limit: args.limit as number | undefined,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
