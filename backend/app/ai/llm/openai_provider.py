import logging
import httpx
from typing import List, Optional
from .base import (
    BaseLLMProvider,
    ChatMessage,
    LLMError,
    LLMConfigError,
    LLMAuthError,
    LLMRateLimitError,
    LLMTimeoutError,
)

logger = logging.getLogger(__name__)


class OpenAILLMProvider(BaseLLMProvider):
    """
    OpenAI-compatible LLM provider.
    Compatible with OpenAI, Groq, OpenRouter, Google AI Studio OpenAI endpoint, and Ollama.
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model_name: str = "gpt-4o-mini",
        timeout_seconds: float = 30.0,
        provider_name: str = "openai",
    ):
        if not api_key:
            raise LLMConfigError(
                "LLM API key is missing. Please configure LLM_API_KEY or OPENAI_API_KEY in your environment or backend/.env file."
            )
        self._api_key = api_key
        self._base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self._model_name = model_name
        self._timeout_seconds = timeout_seconds
        self._provider_name = provider_name

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    def generate_chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        payload_messages = []
        if system_prompt:
            payload_messages.append({"role": "system", "content": system_prompt})
        for msg in messages:
            payload_messages.append({"role": msg.role, "content": msg.content})

        payload = {
            "model": self._model_name,
            "messages": payload_messages,
            "temperature": 0.1 if temperature is None else temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens

        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.post(url, json=payload, headers=headers)

            if response.status_code == 401 or response.status_code == 403:
                raise LLMAuthError(
                    "LLM provider authentication failed. Please verify that your API key is valid."
                )
            elif response.status_code == 429:
                raise LLMRateLimitError(
                    "LLM provider rate limit exceeded. Please try again in a few moments."
                )
            elif response.status_code != 200:
                error_detail = response.text
                try:
                    err_json = response.json()
                    error_detail = err_json.get("error", {}).get("message", response.text)
                except Exception:
                    pass
                raise LLMError(
                    f"LLM provider returned error status {response.status_code}: {error_detail}"
                )

            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                raise LLMError("LLM provider returned empty response choices.")

            msg_obj = choices[0].get("message", {})
            content = msg_obj.get("content") or msg_obj.get("reasoning_content") or msg_obj.get("reasoning") or ""
            return content.strip()

        except httpx.TimeoutException:
            logger.warning(f"LLM request timed out after {self._timeout_seconds}s")
            raise LLMTimeoutError(
                f"LLM provider request timed out after {self._timeout_seconds}s. Please retry."
            )
        except httpx.RequestError as e:
            logger.error(f"Network error communicating with LLM provider: {e}")
            raise LLMError(f"Network error communicating with LLM provider: {str(e)}")
        except LLMError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in LLM provider: {e}", exc_info=True)
            raise LLMError(f"Unexpected error in LLM provider: {str(e)}")
