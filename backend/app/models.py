
from typing import Literal, Optional, List, Dict
from pydantic import BaseModel, EmailStr, Field


Role = Literal["owner", "editor", "viewer"]
AIAction = Literal["rewrite", "summarize", "translate"]


class ErrorBody(BaseModel):
    code: int
    message: str
    detail: Optional[str] = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)


class RegisterResponse(BaseModel):
    user_id: str
    name: str
    email: EmailStr
    created_at: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user_id: str
    name: str


class UserRecord(BaseModel):
    user_id: str
    name: str
    email: EmailStr
    password_hash: str
    created_at: str


class CreateDocumentRequest(BaseModel):
    title: str = Field(min_length=1)


class CreateDocumentResponse(BaseModel):
    document_id: str
    title: str
    owner_id: str
    created_at: str
    updated_at: str
    version: int


class CollaboratorEntry(BaseModel):
    user_id: str
    role: Role


class GetDocumentResponse(BaseModel):
    document_id: str
    title: str
    content: str
    owner_id: str
    version: int
    updated_at: str
    collaborators: List[CollaboratorEntry]


class UpdateDocumentRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class UpdateDocumentResponse(BaseModel):
    document_id: str
    title: str
    version: int
    updated_at: str


class DocumentListItem(BaseModel):
    document_id: str
    title: str
    role: Role
    updated_at: str


class ListDocumentsResponse(BaseModel):
    documents: List[DocumentListItem]


class ShareDocumentRequest(BaseModel):
    user_email: EmailStr
    role: Role


class ShareDocumentResponse(BaseModel):
    document_id: str
    user_id: str
    role: Role
    granted_at: str


class VersionEntry(BaseModel):
    version: int
    title: str
    content: str
    saved_at: str


class ListVersionsResponse(BaseModel):
    versions: List[VersionEntry]


class RestoreVersionResponse(BaseModel):
    document_id: str
    version: int
    updated_at: str