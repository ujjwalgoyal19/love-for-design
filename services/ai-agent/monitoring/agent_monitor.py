"""
Agent Execution Monitoring and Logging System
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import logging
from collections import defaultdict, deque
import json
import os
from pydantic import BaseModel

from agents.base_agent import AgentExecutionLog

logger = logging.getLogger(__name__)


class MonitoringMetrics(BaseModel):
    """Metrics for agent monitoring"""

    agent_id: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    avg_execution_time: float
    total_tokens_used: int
    last_request_time: Optional[datetime]
    error_rate: float
    recent_errors: List[str]


class SystemMetrics(BaseModel):
    """System-wide monitoring metrics"""

    total_agents: int
    active_agents: int
    total_requests: int
    total_successful_requests: int
    total_failed_requests: int
    overall_success_rate: float
    avg_response_time: float
    total_tokens_used: int
    requests_per_minute: float
    top_capabilities: List[Dict[str, Any]]
    agent_health_summary: Dict[str, str]


class AgentMonitor:
    """Monitors agent execution and provides metrics"""

    def __init__(self, log_file: Optional[str] = None, max_logs_per_agent: int = 1000):
        self.log_file = log_file or "agent_execution.log"
        self.max_logs_per_agent = max_logs_per_agent

        # In-memory storage for recent logs
        self.agent_logs: Dict[str, deque] = defaultdict(
            lambda: deque(maxlen=max_logs_per_agent)
        )
        self.system_logs: deque = deque(maxlen=10000)  # System-wide logs

        # Metrics cache
        self.metrics_cache: Dict[str, MonitoringMetrics] = {}
        self.cache_expiry: Dict[str, datetime] = {}
        self.cache_duration = timedelta(minutes=5)

        # Request rate tracking
        self.request_timestamps: deque = deque(maxlen=1000)

        # Setup file logging
        self._setup_file_logging()

    def _setup_file_logging(self):
        """Setup file logging for agent execution"""
        file_handler = logging.FileHandler(self.log_file)
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        file_handler.setFormatter(formatter)

        # Create a separate logger for agent execution
        self.execution_logger = logging.getLogger("agent_execution")
        self.execution_logger.addHandler(file_handler)
        self.execution_logger.setLevel(logging.INFO)

    def log_execution(self, execution_log: AgentExecutionLog):
        """Log an agent execution"""
        # Add to in-memory storage
        self.agent_logs[execution_log.agent_id].append(execution_log)
        self.system_logs.append(execution_log)

        # Track request rate
        self.request_timestamps.append(execution_log.timestamp)

        # Log to file
        log_data = {
            "log_id": execution_log.log_id,
            "agent_id": execution_log.agent_id,
            "request_id": execution_log.request_id,
            "capability": execution_log.capability,
            "timestamp": execution_log.timestamp.isoformat(),
            "execution_time": execution_log.execution_time,
            "success": execution_log.success,
            "tokens_used": execution_log.tokens_used,
            "error": execution_log.error,
            "input_size": execution_log.input_size,
            "output_size": execution_log.output_size,
        }

        self.execution_logger.info(json.dumps(log_data))

        # Invalidate cache for this agent
        if execution_log.agent_id in self.cache_expiry:
            del self.cache_expiry[execution_log.agent_id]

    def get_agent_metrics(
        self, agent_id: str, force_refresh: bool = False
    ) -> Optional[MonitoringMetrics]:
        """Get metrics for a specific agent"""
        # Check cache
        if not force_refresh and agent_id in self.cache_expiry:
            if datetime.now() < self.cache_expiry[agent_id]:
                return self.metrics_cache.get(agent_id)

        # Calculate metrics
        logs = list(self.agent_logs[agent_id])
        if not logs:
            return None

        total_requests = len(logs)
        successful_requests = sum(1 for log in logs if log.success)
        failed_requests = total_requests - successful_requests
        success_rate = successful_requests / total_requests if total_requests > 0 else 0

        execution_times = [log.execution_time for log in logs]
        avg_execution_time = (
            sum(execution_times) / len(execution_times) if execution_times else 0
        )

        total_tokens = sum(log.tokens_used or 0 for log in logs)

        last_request_time = max(log.timestamp for log in logs) if logs else None

        error_rate = failed_requests / total_requests if total_requests > 0 else 0
        recent_errors = [
            log.error for log in logs[-10:] if log.error and not log.success
        ]

        metrics = MonitoringMetrics(
            agent_id=agent_id,
            total_requests=total_requests,
            successful_requests=successful_requests,
            failed_requests=failed_requests,
            success_rate=success_rate,
            avg_execution_time=avg_execution_time,
            total_tokens_used=total_tokens,
            last_request_time=last_request_time,
            error_rate=error_rate,
            recent_errors=recent_errors,
        )

        # Cache the metrics
        self.metrics_cache[agent_id] = metrics
        self.cache_expiry[agent_id] = datetime.now() + self.cache_duration

        return metrics

    def get_system_metrics(self) -> SystemMetrics:
        """Get system-wide metrics"""
        all_logs = list(self.system_logs)

        # Count unique agents
        unique_agents = set(log.agent_id for log in all_logs)
        total_agents = len(unique_agents)

        # Calculate request metrics
        total_requests = len(all_logs)
        successful_requests = sum(1 for log in all_logs if log.success)
        failed_requests = total_requests - successful_requests
        overall_success_rate = (
            successful_requests / total_requests if total_requests > 0 else 0
        )

        # Calculate average response time
        execution_times = [log.execution_time for log in all_logs]
        avg_response_time = (
            sum(execution_times) / len(execution_times) if execution_times else 0
        )

        # Calculate total tokens
        total_tokens_used = sum(log.tokens_used or 0 for log in all_logs)

        # Calculate requests per minute
        now = datetime.now()
        recent_requests = [
            ts for ts in self.request_timestamps if (now - ts).total_seconds() <= 60
        ]
        requests_per_minute = len(recent_requests)

        # Top capabilities
        capability_counts = defaultdict(int)
        for log in all_logs:
            capability_counts[log.capability] += 1

        top_capabilities = [
            {"capability": cap, "count": count}
            for cap, count in sorted(
                capability_counts.items(), key=lambda x: x[1], reverse=True
            )[:10]
        ]

        # Agent health summary
        agent_health_summary = {}
        for agent_id in unique_agents:
            metrics = self.get_agent_metrics(agent_id)
            if metrics:
                if metrics.success_rate >= 0.95:
                    health = "healthy"
                elif metrics.success_rate >= 0.8:
                    health = "warning"
                else:
                    health = "critical"
                agent_health_summary[agent_id] = health

        active_agents = sum(
            1 for health in agent_health_summary.values() if health != "critical"
        )

        return SystemMetrics(
            total_agents=total_agents,
            active_agents=active_agents,
            total_requests=total_requests,
            total_successful_requests=successful_requests,
            total_failed_requests=failed_requests,
            overall_success_rate=overall_success_rate,
            avg_response_time=avg_response_time,
            total_tokens_used=total_tokens_used,
            requests_per_minute=requests_per_minute,
            top_capabilities=top_capabilities,
            agent_health_summary=agent_health_summary,
        )

    def get_agent_health_status(self, agent_id: str) -> Dict[str, Any]:
        """Get detailed health status for an agent"""
        metrics = self.get_agent_metrics(agent_id)
        if not metrics:
            return {"status": "unknown", "message": "No execution data available"}

        # Determine health status
        if metrics.success_rate >= 0.95 and metrics.avg_execution_time < 10:
            status = "healthy"
            message = "Agent is performing well"
        elif metrics.success_rate >= 0.8:
            status = "warning"
            message = f"Success rate is {metrics.success_rate:.1%}, monitor closely"
        else:
            status = "critical"
            message = f"Success rate is {metrics.success_rate:.1%}, immediate attention required"

        # Check for recent activity
        if metrics.last_request_time:
            time_since_last = datetime.now() - metrics.last_request_time
            if time_since_last > timedelta(hours=1):
                status = "inactive"
                message = f"No activity for {time_since_last}"

        return {
            "status": status,
            "message": message,
            "metrics": metrics.dict(),
            "recommendations": self._get_health_recommendations(metrics),
        }

    def _get_health_recommendations(self, metrics: MonitoringMetrics) -> List[str]:
        """Get recommendations based on agent metrics"""
        recommendations = []

        if metrics.success_rate < 0.8:
            recommendations.append(
                "Investigate recent errors and consider adjusting configuration"
            )

        if metrics.avg_execution_time > 15:
            recommendations.append(
                "Consider optimizing prompts or reducing max_tokens to improve response time"
            )

        if metrics.error_rate > 0.1:
            recommendations.append(
                "High error rate detected - check API connectivity and rate limits"
            )

        if len(metrics.recent_errors) > 3:
            recommendations.append(
                "Multiple recent errors - review error patterns and agent configuration"
            )

        return recommendations

    def get_capability_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get metrics grouped by capability"""
        capability_metrics = defaultdict(
            lambda: {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "avg_execution_time": 0,
                "agents_used": set(),
            }
        )

        for log in self.system_logs:
            cap_metrics = capability_metrics[log.capability]
            cap_metrics["total_requests"] += 1
            cap_metrics["agents_used"].add(log.agent_id)

            if log.success:
                cap_metrics["successful_requests"] += 1
            else:
                cap_metrics["failed_requests"] += 1

        # Calculate averages and convert sets to lists
        result = {}
        for capability, metrics in capability_metrics.items():
            total = metrics["total_requests"]
            success_rate = metrics["successful_requests"] / total if total > 0 else 0

            # Calculate average execution time for this capability
            cap_logs = [log for log in self.system_logs if log.capability == capability]
            avg_time = (
                sum(log.execution_time for log in cap_logs) / len(cap_logs)
                if cap_logs
                else 0
            )

            result[capability] = {
                "total_requests": total,
                "success_rate": success_rate,
                "avg_execution_time": avg_time,
                "agents_count": len(metrics["agents_used"]),
                "agents_used": list(metrics["agents_used"]),
            }

        return result

    def get_recent_errors(
        self, hours: int = 24, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get recent errors across all agents"""
        cutoff_time = datetime.now() - timedelta(hours=hours)

        recent_error_logs = [
            log
            for log in self.system_logs
            if not log.success and log.timestamp >= cutoff_time
        ]

        # Sort by timestamp (most recent first)
        recent_error_logs.sort(key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "timestamp": log.timestamp.isoformat(),
                "agent_id": log.agent_id,
                "capability": log.capability,
                "error": log.error,
                "execution_time": log.execution_time,
                "request_id": log.request_id,
            }
            for log in recent_error_logs[:limit]
        ]

    def clear_logs(
        self, agent_id: Optional[str] = None, older_than_hours: Optional[int] = None
    ):
        """Clear logs for maintenance"""
        if older_than_hours:
            cutoff_time = datetime.now() - timedelta(hours=older_than_hours)

            if agent_id:
                # Clear old logs for specific agent
                agent_logs = self.agent_logs[agent_id]
                self.agent_logs[agent_id] = deque(
                    [log for log in agent_logs if log.timestamp >= cutoff_time],
                    maxlen=self.max_logs_per_agent,
                )
            else:
                # Clear old logs for all agents
                for aid in self.agent_logs:
                    agent_logs = self.agent_logs[aid]
                    self.agent_logs[aid] = deque(
                        [log for log in agent_logs if log.timestamp >= cutoff_time],
                        maxlen=self.max_logs_per_agent,
                    )

                # Clear system logs
                self.system_logs = deque(
                    [log for log in self.system_logs if log.timestamp >= cutoff_time],
                    maxlen=10000,
                )
        else:
            if agent_id:
                # Clear all logs for specific agent
                self.agent_logs[agent_id].clear()
            else:
                # Clear all logs
                self.agent_logs.clear()
                self.system_logs.clear()

        # Clear cache
        self.metrics_cache.clear()
        self.cache_expiry.clear()

        logger.info(f"Cleared logs for agent: {agent_id or 'all'}")

    def export_metrics(self, filepath: str, format: str = "json"):
        """Export metrics to file"""
        system_metrics = self.get_system_metrics()

        if format.lower() == "json":
            with open(filepath, "w") as f:
                json.dump(system_metrics.dict(), f, indent=2, default=str)
        else:
            raise ValueError(f"Unsupported export format: {format}")

        logger.info(f"Exported metrics to {filepath}")
