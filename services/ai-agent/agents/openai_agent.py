"""
OpenAI-based AI Agent implementation
"""

from typing import Dict, Any, List
import logging
from openai import AsyncOpenAI
import os

from agents.base_agent import AIAgent, AgentInput, AgentCapability, AgentConfig

logger = logging.getLogger(__name__)


class OpenAIAgent(AIAgent):
    """OpenAI-powered AI agent"""

    def __init__(
        self,
        agent_id: str,
        name: str,
        description: str,
        capabilities: List[AgentCapability],
        config: AgentConfig,
        priority: int = 0,
    ):
        super().__init__(agent_id, name, description, capabilities, config, priority)

        # Initialize OpenAI client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning(f"OPENAI_API_KEY not set for agent {agent_id}")
            self.client = None
        else:
            self.client = AsyncOpenAI(api_key=api_key)

    async def _execute(self, agent_input: AgentInput) -> Dict[str, Any]:
        """Execute OpenAI-based processing"""
        if not self.client:
            raise Exception("OpenAI client not initialized - missing API key")

        capability = agent_input.capability
        data = agent_input.data
        context = agent_input.context or {}

        # Build prompt based on capability
        prompt = self._build_prompt(capability, data, context)

        try:
            # Make OpenAI API call
            completion = await self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
                **self.config.custom_params,
            )

            result_text = completion.choices[0].message.content
            tokens_used = completion.usage.total_tokens if completion.usage else 0

            # Process result based on capability
            processed_result = self._process_result(capability, result_text, data)

            return {
                "result": processed_result,
                "metadata": {
                    "model_used": self.config.model,
                    "prompt_length": len(prompt),
                    "response_length": len(result_text),
                },
                "tokens_used": tokens_used,
            }

        except Exception as e:
            logger.error(f"OpenAI API error in agent {self.agent_id}: {str(e)}")
            raise

    def _build_prompt(
        self, capability: str, data: Dict[str, Any], context: Dict[str, Any]
    ) -> str:
        """Build prompt based on capability and data"""
        base_context = context.get("system_context", "")

        if capability == "question_generation":
            return self._build_question_generation_prompt(data, base_context)
        elif capability == "design_review":
            return self._build_design_review_prompt(data, base_context)
        elif capability == "document_generation":
            return self._build_document_generation_prompt(data, base_context)
        elif capability == "canvas_suggestion":
            return self._build_canvas_suggestion_prompt(data, base_context)
        else:
            # Generic prompt
            return f"{base_context}\n\nTask: {capability}\nData: {data}"

    def _build_question_generation_prompt(
        self, data: Dict[str, Any], context: str
    ) -> str:
        """Build prompt for question generation"""
        category = data.get("category", "general")
        previous_answers = data.get("previous_answers", {})
        question_type = data.get("question_type", "follow_up")
        max_questions = data.get("max_questions", 5)

        prompt = f"""You are an expert system design interviewer specializing in {category} systems. Your goal is to generate insightful questions that help understand system requirements and design decisions.

{context}

Question Type: {question_type}
Category: {category}
Maximum Questions: {max_questions}

Previous Q&A Context:
"""
        if previous_answers:
            for qa_pair in previous_answers.items():
                question, answer = qa_pair
                prompt += f"Q: {question}\nA: {answer}\n\n"
        else:
            prompt += "No previous answers (initial questions)\n\n"

        if question_type == "initial":
            prompt += f"""Generate {max_questions} initial questions to understand the basic requirements for a {category} system design.
Focus on:
- System scope and scale
- Key functional requirements
- Performance expectations
- User base and usage patterns
- Technical constraints"""
        elif question_type == "follow_up":
            prompt += f"""Based on the previous answers, generate {max_questions} follow-up questions that:
- Clarify ambiguous or incomplete answers
- Dive deeper into technical details
- Explore edge cases and failure scenarios
- Understand non-functional requirements
- Identify system boundaries and interfaces"""
        elif question_type == "clarification":
            prompt += f"""Generate {max_questions} clarification questions to:
- Resolve contradictions in previous answers
- Get specific numbers and metrics
- Understand trade-offs and priorities
- Clarify technical terminology used
- Validate assumptions made"""

        prompt += """

Return the questions in JSON format:
{
  "questions": [
    {
      "text": "Clear, specific question text",
      "type": "text_input|multiple_choice|scale|boolean",
      "category": "requirements|architecture|scalability|performance|security|data|integration",
      "priority": "high|medium|low",
      "follow_up_trigger": "condition that would trigger this question",
      "expected_answer_type": "description of expected answer format"
    }
  ],
  "context_used": {
    "previous_answers_count": 0,
    "category_focus": "category",
    "question_type": "type"
  }
}"""

        return prompt

    def _build_design_review_prompt(self, data: Dict[str, Any], context: str) -> str:
        """Build prompt for design review"""
        design_data = data.get("design_data", {})
        review_focus = data.get(
            "review_focus", ["scalability", "reliability", "performance", "security"]
        )
        detail_level = data.get("detail_level", "comprehensive")

        prompt = f"""You are a senior system architect with expertise in large-scale distributed systems. Review the provided system design with a focus on {', '.join(review_focus)}.

{context}

Review Focus Areas: {', '.join(review_focus)}
Detail Level: {detail_level}

System Design to Review:
{design_data}

Provide a {detail_level} review covering:

1. ARCHITECTURE ANALYSIS
   - Overall architecture soundness
   - Component separation and responsibilities
   - Data flow and communication patterns
   - Technology choices and their appropriateness

2. SCALABILITY ASSESSMENT
   - Horizontal and vertical scaling capabilities
   - Bottlenecks and scaling limitations
   - Load distribution strategies
   - Database scaling approaches

3. RELIABILITY & AVAILABILITY
   - Single points of failure
   - Fault tolerance mechanisms
   - Disaster recovery considerations
   - Monitoring and alerting strategies

4. PERFORMANCE EVALUATION
   - Latency and throughput expectations
   - Caching strategies
   - Database query optimization
   - Network communication efficiency

5. SECURITY REVIEW
   - Authentication and authorization
   - Data encryption and protection
   - API security measures
   - Compliance considerations

6. OPERATIONAL CONCERNS
   - Deployment complexity
   - Maintenance and updates
   - Debugging and troubleshooting
   - Cost implications

Return your review in JSON format:
{
  "review_summary": "High-level summary of the design quality and main findings",
  "detailed_feedback": [
    {
      "category": "architecture|scalability|reliability|performance|security|operational",
      "severity": "critical|high|medium|low|info",
      "title": "Brief title of the finding",
      "description": "Detailed explanation of the issue or observation",
      "impact": "Potential impact on the system",
      "recommendation": "Specific actionable recommendation"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "architecture|scalability|reliability|performance|security|operational",
      "title": "Recommendation title",
      "description": "Detailed recommendation",
      "implementation_effort": "low|medium|high",
      "expected_benefit": "Expected benefit of implementing this recommendation"
    }
  ],
  "risk_assessment": {
    "overall_risk_level": "low|medium|high|critical",
    "critical_risks": ["list of critical risks"],
    "mitigation_priorities": ["ordered list of mitigation priorities"],
    "deployment_readiness": "ready|needs_work|not_ready"
  }
}"""

        return prompt

    def _build_document_generation_prompt(
        self, data: Dict[str, Any], context: str
    ) -> str:
        """Build prompt for document generation"""
        design_session_data = data.get("design_session_data", {})
        template_type = data.get("template_type", "technical_spec")
        sections = data.get("sections", [])
        formatting_options = data.get("formatting_options", {})

        # Define default sections for each template type
        default_sections = {
            "technical_spec": [
                "Executive Summary",
                "System Overview",
                "Requirements",
                "Architecture Design",
                "Component Specifications",
                "Data Models",
                "API Specifications",
                "Security Design",
                "Performance Considerations",
                "Deployment Architecture",
                "Monitoring and Observability",
                "Testing Strategy",
            ],
            "design_document": [
                "Introduction",
                "Problem Statement",
                "Solution Overview",
                "System Architecture",
                "Design Decisions",
                "Implementation Plan",
                "Risk Assessment",
                "Success Metrics",
            ],
            "presentation": [
                "Problem Definition",
                "Solution Approach",
                "Architecture Overview",
                "Key Components",
                "Scalability Strategy",
                "Implementation Timeline",
                "Q&A Preparation",
            ],
        }

        sections_to_generate = (
            sections
            if sections
            else default_sections.get(template_type, default_sections["technical_spec"])
        )

        prompt = f"""You are an expert technical writer specializing in system design documentation. Create a comprehensive {template_type} based on the provided design session data.

{context}

Template Type: {template_type}
Formatting Options: {formatting_options}

Design Session Data:
{design_session_data}

Generate a professional document with the following sections:
{chr(10).join([f"{i+1}. {section}" for i, section in enumerate(sections_to_generate)])}

Guidelines:
- Use clear, professional technical writing
- Include specific technical details from the design session
- Provide concrete examples and implementation details
- Use appropriate technical terminology
- Structure content logically with proper headings
- Include diagrams descriptions where relevant
- Ensure consistency across sections
- Target audience: Technical stakeholders and development teams

Return the document in JSON format:
{{
  "document_content": "Full document content in markdown format",
  "sections_generated": {sections_to_generate},
  "word_count": 0,
  "key_topics_covered": ["topic1", "topic2", "topic3"],
  "technical_depth": "high|medium|low",
  "completeness_score": 0.0
}}"""

        return prompt

    def _build_canvas_suggestion_prompt(
        self, data: Dict[str, Any], context: str
    ) -> str:
        """Build prompt for canvas suggestions"""
        design_context = data.get("design_context", {})
        current_canvas_state = data.get("current_canvas_state", {})
        suggestion_type = data.get("suggestion_type", "architecture")
        complexity_level = data.get("complexity_level", "medium")
        preferred_style = data.get("preferred_style", "technical")

        prompt = f"""You are a system architecture visualization expert. Analyze the design context and current canvas state to provide intelligent suggestions for improving the visual representation.

{context}

Suggestion Type: {suggestion_type}
Complexity Level: {complexity_level}
Preferred Style: {preferred_style}

Design Context:
{design_context}

Current Canvas State:
{current_canvas_state}

Based on the design context and current canvas state, provide suggestions for:

1. MISSING COMPONENTS
   - Essential system components not yet visualized
   - Supporting services and infrastructure
   - External dependencies and integrations
   - Data stores and caches

2. CONNECTIONS AND RELATIONSHIPS
   - Data flow connections
   - API calls and service communications
   - Event streams and message queues
   - Dependency relationships

3. VISUAL ORGANIZATION
   - Logical groupings and boundaries
   - Layer separation (presentation, business, data)
   - Network zones and security boundaries
   - Deployment environments

4. ANNOTATIONS AND LABELS
   - Technology stack labels
   - Performance metrics and SLAs
   - Security considerations
   - Scaling indicators

5. DIAGRAM ENHANCEMENTS
   - Color coding for different component types
   - Icon suggestions for better recognition
   - Layout improvements for clarity
   - Size adjustments based on importance

Consider the {complexity_level} complexity level and {preferred_style} style preferences.

Return suggestions in JSON format:
{{
  "suggestions": [
    {{
      "type": "add_component|add_connection|add_group|add_annotation|modify_layout",
      "priority": "high|medium|low",
      "title": "Brief suggestion title",
      "description": "Detailed explanation of the suggestion",
      "rationale": "Why this suggestion improves the diagram"
    }}
  ],
  "diagram_snippets": [
    {{
      "name": "snippet_name",
      "type": "architecture_pattern|flow_diagram|component_detail",
      "description": "What this snippet represents",
      "elements": [
        {{
          "type": "rectangle|circle|arrow|text",
          "label": "element_label",
          "position": {{"x": 100, "y": 200}},
          "properties": {{"color": "#color", "size": "small|medium|large"}}
        }}
      ]
    }}
  ],
  "recommended_elements": [
    {{
      "element_type": "service|database|queue|cache|load_balancer|api_gateway",
      "name": "element_name",
      "description": "Purpose and role in the system",
      "suggested_position": {{"x": 100, "y": 200}},
      "connections_to": ["existing_element1", "existing_element2"],
      "properties": {{"technology": "tech_name", "criticality": "high|medium|low"}}
    }}
  ],
  "canvas_modifications": {{
    "layout_suggestions": [
      {{
        "type": "reorganize|resize|recolor|reposition",
        "target": "element_or_group_name",
        "change": "specific change to make",
        "benefit": "how this improves the diagram"
      }}
    ],
    "style_improvements": [
      {{
        "aspect": "colors|fonts|spacing|alignment",
        "current_issue": "what's currently problematic",
        "suggested_change": "specific improvement",
        "impact": "visual impact of the change"
      }}
    ]
  }}
}}"""

        return prompt

    def _process_result(
        self, capability: str, result_text: str, original_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process the AI result based on capability"""
        import json
        import re

        try:
            # Try to parse as JSON first
            parsed_result = json.loads(result_text)

            # Post-process based on capability
            if capability == "question_generation":
                return self._post_process_questions(parsed_result, original_data)
            elif capability == "design_review":
                return self._post_process_design_review(parsed_result, original_data)
            elif capability == "document_generation":
                return self._post_process_document(parsed_result, original_data)
            elif capability == "canvas_suggestion":
                return self._post_process_canvas_suggestions(
                    parsed_result, original_data
                )
            else:
                return parsed_result

        except json.JSONDecodeError:
            # Try to extract JSON from text if it's embedded
            json_match = re.search(r"\{.*\}", result_text, re.DOTALL)
            if json_match:
                try:
                    parsed_result = json.loads(json_match.group())
                    return parsed_result
                except json.JSONDecodeError:
                    pass

            # Fallback to text format
            return {
                "content": result_text,
                "raw_response": result_text,
                "parse_error": True,
            }

    def _post_process_questions(
        self, result: Dict[str, Any], original_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Post-process question generation results"""
        questions = result.get("questions", [])

        # Validate and enhance questions
        processed_questions = []
        for q in questions:
            processed_q = {
                "text": q.get("text", ""),
                "type": q.get("type", "text_input"),
                "category": q.get("category", "general"),
                "priority": q.get("priority", "medium"),
                "follow_up_trigger": q.get("follow_up_trigger", ""),
                "expected_answer_type": q.get("expected_answer_type", "text"),
                "id": f"q_{len(processed_questions) + 1}_{hash(q.get('text', ''))}",
            }
            processed_questions.append(processed_q)

        return {
            "questions": processed_questions,
            "context_used": result.get("context_used", {}),
            "generation_metadata": {
                "total_questions": len(processed_questions),
                "question_types": list(set(q["type"] for q in processed_questions)),
                "categories": list(set(q["category"] for q in processed_questions)),
            },
        }

    def _post_process_design_review(
        self, result: Dict[str, Any], original_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Post-process design review results"""
        detailed_feedback = result.get("detailed_feedback", [])
        recommendations = result.get("recommendations", [])

        # Add IDs and validate structure
        for i, feedback in enumerate(detailed_feedback):
            feedback["id"] = f"feedback_{i + 1}"
            feedback.setdefault("severity", "medium")
            feedback.setdefault("category", "general")

        for i, rec in enumerate(recommendations):
            rec["id"] = f"rec_{i + 1}"
            rec.setdefault("priority", "medium")
            rec.setdefault("implementation_effort", "medium")

        return {
            "review_summary": result.get("review_summary", ""),
            "detailed_feedback": detailed_feedback,
            "recommendations": recommendations,
            "risk_assessment": result.get("risk_assessment", {}),
            "review_metadata": {
                "feedback_count": len(detailed_feedback),
                "recommendation_count": len(recommendations),
                "severity_distribution": self._count_by_field(
                    detailed_feedback, "severity"
                ),
                "category_distribution": self._count_by_field(
                    detailed_feedback, "category"
                ),
            },
        }

    def _post_process_document(
        self, result: Dict[str, Any], original_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Post-process document generation results"""
        document_content = result.get("document_content", "")

        # Calculate word count if not provided
        word_count = result.get("word_count", 0)
        if word_count == 0 and document_content:
            word_count = len(document_content.split())

        return {
            "document_content": document_content,
            "sections_generated": result.get("sections_generated", []),
            "word_count": word_count,
            "key_topics_covered": result.get("key_topics_covered", []),
            "technical_depth": result.get("technical_depth", "medium"),
            "completeness_score": result.get("completeness_score", 0.8),
            "generation_metadata": {
                "character_count": len(document_content),
                "section_count": len(result.get("sections_generated", [])),
                "estimated_reading_time": max(
                    1, word_count // 200
                ),  # ~200 words per minute
            },
        }

    def _post_process_canvas_suggestions(
        self, result: Dict[str, Any], original_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Post-process canvas suggestion results"""
        suggestions = result.get("suggestions", [])
        diagram_snippets = result.get("diagram_snippets", [])
        recommended_elements = result.get("recommended_elements", [])

        # Add IDs and validate structure
        for i, suggestion in enumerate(suggestions):
            suggestion["id"] = f"suggestion_{i + 1}"
            suggestion.setdefault("priority", "medium")

        for i, snippet in enumerate(diagram_snippets):
            snippet["id"] = f"snippet_{i + 1}"
            snippet.setdefault("type", "architecture_pattern")

        for i, element in enumerate(recommended_elements):
            element["id"] = f"element_{i + 1}"
            element.setdefault("properties", {})

        return {
            "suggestions": suggestions,
            "diagram_snippets": diagram_snippets,
            "recommended_elements": recommended_elements,
            "canvas_modifications": result.get("canvas_modifications", {}),
            "suggestion_metadata": {
                "total_suggestions": len(suggestions),
                "snippet_count": len(diagram_snippets),
                "element_count": len(recommended_elements),
                "priority_distribution": self._count_by_field(suggestions, "priority"),
                "suggestion_types": list(
                    set(s.get("type", "unknown") for s in suggestions)
                ),
            },
        }

    def _count_by_field(self, items: List[Dict], field: str) -> Dict[str, int]:
        """Count occurrences of field values in a list of dictionaries"""
        counts = {}
        for item in items:
            value = item.get(field, "unknown")
            counts[value] = counts.get(value, 0) + 1
        return counts
