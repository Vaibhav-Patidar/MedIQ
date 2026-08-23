"""Consistent error envelope (docs/05-api-spec.md Section 11):
{ "error": "machine_readable_code", "message": "human readable string", "details": {} }"""
from typing import Any


class ApiError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str = "", details: Any = None,
                 status_code: int | None = None, code: str | None = None) -> None:
        self.message = message or self.__class__.message_default
        self.details = details if details is not None else {}
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        super().__init__(self.message)


class InvalidCredentials(ApiError):
    status_code, code, message_default = 401, "invalid_credentials", "Email or password is incorrect."


class Unauthorized(ApiError):
    status_code, code, message_default = 401, "unauthorized", "Missing or expired bearer token."


class Forbidden(ApiError):
    status_code, code, message_default = 403, "forbidden", "Role not permitted."


class PatientNotFound(ApiError):
    status_code, code, message_default = 404, "patient_not_found", "Patient does not exist."


class ResourceNotFound(ApiError):
    status_code, code, message_default = 404, "not_found", "Resource does not exist."


def envelope(code: str, message: str, details: Any = None) -> dict:
    return {"error": code, "message": message, "details": details if details is not None else {}}
